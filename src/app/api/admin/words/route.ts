import {
  isVocabularyPoolCreationPending,
  VocabularyPoolStateError,
} from '@/src/lib/vocabulary-pools/pool-state.server';
import { resolveVocabularyPool } from '@/src/lib/vocabulary-pools/linked-pools.server';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query, FieldPath } from 'firebase-admin/firestore';
import { VocabularyWordSchema } from '@/shared/types/vocabulary/schemas';
import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';
import { TABLE_TYPE_CONFIG, type TableType } from '@/src/utils/schema-helpers';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { scanTableForMatchingForms, categorizeMatchingPaths } from '@/src/utils/tableScanner';
import { getApplicableStepsForFormPath } from '@/src/utils/exercises/formIdentificationCompatibility';
import { isSelectableMorphologyForm } from '@/src/utils/morphologyForms';
import { stripMacrons } from '@/src/utils/exercises/helpers';
import { AdminAccessError, verifyAdminAccess, verifyAuthenticatedAccess } from '@/src/lib/verifyAdminAccess';
import {
  requireVocabularyWordsCollection,
  VocabularyWordCollectionError,
} from '@/src/lib/vocabulary/word-collection.server';
import { getReadableVocabularyPool } from '@/src/lib/vocabulary-pools/archive.server';
import { prepareVocabularyContentRevisionBump } from '@/src/lib/vocabulary-pools/content-revision.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

const TABLE_FIELDS = ['word', 'conjugation_table', 'declension_table', 'degrees_table'] as const;
const GENERATED_WORD_FIELDS = new Set([
  'id',
  'root_word',
  'dictionary_entry',
  'selected_form',
  'part_of_speech',
  'form_path',
  'primary_form_paths',
  'optional_form_paths',
  'conjugation',
  'declension',
  'definitions',
  'is_deponent',
  'translation',
  'gender',
  'pronoun_type',
  'person',
]);
const GENERATED_MAX_RESULTS = 200;
const GENERATED_MAX_LIST_VALUES = 30;
const GENERATED_MAX_CELL_PATHS = 100;
const COUNTED_PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'pronoun',
  'conjunction',
  'interjection',
] as const;

const generatedRequestError = (error: string) => NextResponse.json({ success: false, error }, { status: 400 });

const sanitizeGeneratedWord = (word: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(word).filter(([field]) => GENERATED_WORD_FIELDS.has(field)));

const serializeTimestamp = (value: unknown): string | undefined => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
};

const serializeWord = (data: Record<string, unknown>): Record<string, unknown> => {
  const serialized = { ...data };
  const createdAt = serializeTimestamp(serialized.createdAt);
  const updatedAt = serializeTimestamp(serialized.updatedAt);
  if (createdAt) serialized.createdAt = createdAt;
  if (updatedAt) serialized.updatedAt = updatedAt;
  return serialized;
};

const parseCsv = (value: string | null): string[] =>
  value
    ? value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
    : [];

const applyMultiValueFilter = (query: Query, field: string, paramValue: string | null): Query => {
  const values = parseCsv(paramValue);
  if (values.length === 0) return query;
  return values.length === 1 ? query.where(field, '==', values[0]) : query.where(field, 'in', values);
};

const shuffle = <T>(items: T[], random: () => number = Math.random): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const hashSeed = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seed: string): (() => number) => {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const pickPoolWordIds = (
  wordDocIds: string[],
  limitCount: number,
  fetchAllWords: boolean,
  sampleSeed: string | null,
  offset = 0
): string[] => {
  if (fetchAllWords) {
    return [...wordDocIds];
  }
  const ordered = sampleSeed ? shuffle(wordDocIds, createSeededRandom(sampleSeed)) : shuffle(wordDocIds);
  return ordered.slice(offset, offset + Math.max(1, limitCount));
};

function errorResponse(error: unknown, action: string): NextResponse {
  if (error instanceof VocabularyPoolStateError || error instanceof VocabularyWordCollectionError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error(`Error ${action}:`, error);
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' },
    { status: 500 }
  );
}

export const dynamic = 'force-dynamic';

export async function handleVocabularyWordsGET(
  request: NextRequest,
  audience: 'admin' | 'generated' = 'admin'
): Promise<NextResponse> {
  try {
    if (audience === 'admin') await verifyAdminAccess(request);
    else await verifyAuthenticatedAccess(request);
    const { searchParams } = new URL(request.url);
    const wordType = searchParams.get('wordType');
    const limit = parseInt(searchParams.get('limit') || '20');
    const lastWordId = searchParams.get('lastWordId');
    const search = searchParams.get('search');
    const countsOnly = searchParams.get('countsOnly') === 'true';
    const collection = requireVocabularyWordsCollection(searchParams.get('collection'));
    const verbConjugation = searchParams.get('verbConjugation');
    const isDeponent = searchParams.get('isDeponent');
    const nounDeclension = searchParams.get('nounDeclension');
    const adjectiveDeclension = searchParams.get('adjectiveDeclension');
    const pronounType = searchParams.get('pronounType');
    const pronounPerson = searchParams.get('pronounPerson');
    const cellPaths = searchParams.get('cellPaths');
    const pathValues = parseCsv(cellPaths);
    const steps = searchParams.get('steps');
    const stepValues = parseCsv(steps) as FormIdentificationStep[];
    const tableType = searchParams.get('tableType') as TableType | null;
    const selectValues = parseCsv(searchParams.get('select'));
    const fetchAll = searchParams.get('fetchAll') === 'true';
    const randomize = !fetchAll && searchParams.get('randomize') === 'true';
    const randomStart = searchParams.get('randomStart');
    const poolId = searchParams.get('poolId');
    const poolSampleSeed = searchParams.get('poolSampleSeed');
    const poolOffset = Number(searchParams.get('poolOffset') ?? '0');
    const exerciseMode = searchParams.get('exerciseMode') === 'true';

    if (audience === 'generated' && (!exerciseMode || countsOnly)) {
      return NextResponse.json(
        { success: false, error: 'Generated word requests must use exercise mode' },
        { status: 400 }
      );
    }
    if (audience === 'generated') {
      const rawLimit = searchParams.get('limit') ?? '20';
      const listParams = [verbConjugation, nounDeclension, adjectiveDeclension, pronounType, pronounPerson];
      if (fetchAll) return generatedRequestError('Generated word requests cannot use fetchAll');
      if (!/^\d+$/.test(rawLimit) || limit < 1 || limit > GENERATED_MAX_RESULTS)
        return generatedRequestError(`Generated word limit must be between 1 and ${GENERATED_MAX_RESULTS}`);
      if (pathValues.length > GENERATED_MAX_CELL_PATHS || (cellPaths?.length ?? 0) > 10_000)
        return generatedRequestError('Generated word cellPaths are too large');
      if (stepValues.length > 20 || (steps?.length ?? 0) > 2_000)
        return generatedRequestError('Generated word steps are too large');
      if (
        selectValues.length > GENERATED_MAX_LIST_VALUES ||
        selectValues.some(field => field.length > 100 || !/^[A-Za-z0-9_.]+$/.test(field))
      )
        return generatedRequestError('Generated word select fields are invalid or too large');
      if (
        listParams.some(value => {
          const entries = value?.split(',').filter(Boolean) ?? [];
          return entries.length > GENERATED_MAX_LIST_VALUES || entries.some(entry => entry.length > 100);
        })
      )
        return generatedRequestError('Generated word filters are too large');
      if ((search?.length ?? 0) > 200 || (poolId?.length ?? 0) > 200 || (poolSampleSeed?.length ?? 0) > 200)
        return generatedRequestError('Generated word request parameters are too large');
      if (!Number.isSafeInteger(poolOffset) || poolOffset < 0)
        return generatedRequestError('Generated word poolOffset must be a non-negative integer');
      if ((lastWordId?.length ?? 0) > 200)
        return generatedRequestError('Generated word pagination cursor is too large');
      if (
        randomStart !== null &&
        (!Number.isFinite(Number(randomStart)) || Number(randomStart) < 0 || Number(randomStart) >= 1)
      )
        return generatedRequestError('Generated word randomStart must be between 0 and 1');
    }

    if (countsOnly) {
      const wordTypeCounts = await getWordTypeCounts(collection);
      return NextResponse.json({
        success: true,
        data: {
          wordTypeCounts,
        },
      });
    }

    // Random ordering serves exercise generation; it never applies to search or cursor pagination.
    const useRandomOrder = randomStart !== null && !search && !lastWordId;
    const randomThreshold = useRandomOrder ? parseFloat(randomStart) : null;
    let snapshot;
    let fetchLimit = limit;
    let poolSourceMeta: { totalIds: number; requestedCount: number; offset: number } | null = null;

    if (poolId) {
      const readablePool =
        audience === 'generated'
          ? await getReadableVocabularyPool(adminDb, poolId)
          : await adminDb
              .collection('vocabulary_pools')
              .doc(poolId)
              .get()
              .then(async poolDoc =>
                poolDoc.exists && !isVocabularyPoolCreationPending(poolDoc.data())
                  ? {
                      data: await resolveVocabularyPool(adminDb, poolId, poolDoc.data() ?? {}),
                      words: adminDb.collection(collection),
                      source: 'active' as const,
                    }
                  : null
              );
      if (!readablePool) {
        return NextResponse.json(
          {
            success: false,
            error: 'Pool not found',
          },
          { status: 404 }
        );
      }

      const wordDocIds = (readablePool.data.wordDocIds || []) as string[];

      if (wordDocIds.length === 0) {
        snapshot = { docs: [], size: 0, empty: true };
        poolSourceMeta = { totalIds: 0, requestedCount: 0, offset: poolOffset };
      } else {
        const idsToFetch = pickPoolWordIds(wordDocIds, limit, fetchAll, poolSampleSeed, poolOffset);
        poolSourceMeta = { totalIds: wordDocIds.length, requestedCount: idsToFetch.length, offset: poolOffset };

        if (idsToFetch.length === 0) {
          snapshot = { docs: [], size: 0, empty: true };
        } else {
          const batches = [];
          for (let i = 0; i < idsToFetch.length; i += 10) {
            const chunk = idsToFetch.slice(i, i + 10);
            let batchQuery: Query = readablePool.words.where(FieldPath.documentId(), 'in', chunk);
            if (selectValues.length > 0) {
              batchQuery = batchQuery.select(...selectValues);
            }
            batches.push(batchQuery.get());
          }

          const batchResults = await Promise.all(batches);
          let docsFromPool = batchResults.flatMap(result => result.docs);

          if (wordType && wordType !== 'all') {
            docsFromPool = docsFromPool.filter(doc => doc.data().part_of_speech === wordType);
          }

          snapshot = {
            docs: docsFromPool,
            size: docsFromPool.length,
            empty: docsFromPool.length === 0,
          };
        }
      }
    } else {
      const applyWordFilters = (query: Query, searchKey?: string): Query => {
        if (wordType) query = query.where('part_of_speech', '==', wordType);
        if (searchKey !== undefined) {
          query = query.where('sort_key', '>=', searchKey).where('sort_key', '<=', searchKey + '\uf8ff');
        }
        if (wordType === 'verb') {
          query = applyMultiValueFilter(query, 'conjugation', verbConjugation);
          if (isDeponent === 'true' || isDeponent === 'false') {
            query = query.where('is_deponent', '==', isDeponent === 'true');
          }
        } else if (wordType === 'noun') {
          query = applyMultiValueFilter(query, 'declension', nounDeclension);
        } else if (wordType === 'adjective') {
          query = applyMultiValueFilter(query, 'declension', adjectiveDeclension);
        } else if (wordType === 'pronoun') {
          query = applyMultiValueFilter(query, 'pronoun_type', pronounType);
          query = applyMultiValueFilter(query, 'person', pronounPerson);
        }
        return query;
      };
      const selectFields = (query: Query) => (selectValues.length > 0 ? query.select(...selectValues) : query);

      let query = selectFields(adminDb.collection(collection));
      query =
        randomThreshold !== null
          ? query.orderBy('random_index').where('random_index', '>=', randomThreshold)
          : query.orderBy('sort_key');
      query = applyWordFilters(query, search ? stripMacrons(search) : undefined);

      if (lastWordId && !fetchAll) {
        const lastDocSnapshot = await adminDb.collection(collection).doc(lastWordId).get();
        if (lastDocSnapshot.exists) {
          query = query.startAfter(lastDocSnapshot);
        }
      }

      if (!fetchAll) {
        fetchLimit = randomize ? Math.min(limit * 10, 200) : limit;
        query = query.limit(fetchLimit);
      }

      snapshot = await query.get();

      // Wrap around to the start of the random_index range when the tail holds too few words.
      if (randomThreshold !== null && !fetchAll && snapshot.docs.length < limit) {
        const wrapQuery = applyWordFilters(
          selectFields(adminDb.collection(collection))
            .orderBy('random_index')
            .where('random_index', '<', randomThreshold)
        );
        const wrapSnapshot = await wrapQuery.limit(limit - snapshot.docs.length).get();
        snapshot = {
          docs: [...snapshot.docs, ...wrapSnapshot.docs],
          size: snapshot.size + wrapSnapshot.size,
          empty: snapshot.empty && wrapSnapshot.empty,
        };
      }
    }

    let docs = snapshot.docs;
    if (!poolId && randomize && docs.length > limit) {
      const shuffled = [...docs].sort(() => Math.random() - 0.5);
      docs = shuffled.slice(0, limit);
    }

    const isExerciseMode = !!tableType || exerciseMode;
    const words = docs
      .map(doc => {
        const serialized = serializeWord(doc.data());
        if (!isExerciseMode) {
          return { id: doc.id, ...serialized };
        }

        let formFields: Record<string, unknown> = {
          selected_form: serialized.word as string,
          form_path: null,
          primary_form_paths: undefined,
          optional_form_paths: undefined,
        };
        if (pathValues.length > 0 && tableType) {
          const formResult = pickRandomFormServer(serialized, tableType, pathValues, stepValues);
          if (!formResult) {
            return null;
          }
          const toFormPaths = (paths: string[]) =>
            paths
              .map(path => parseFormPathFromString(path, tableType))
              .filter((formPath): formPath is NonNullable<typeof formPath> => formPath !== null);
          const primaryFormPaths = toFormPaths(formResult.primaryPaths);
          const optionalFormPaths = toFormPaths(formResult.optionalPaths);
          formFields = {
            selected_form: formResult.selectedForm,
            form_path: parseFormPathFromString(formResult.selectedPath, tableType),
            primary_form_paths: primaryFormPaths.length > 0 ? primaryFormPaths : undefined,
            optional_form_paths: optionalFormPaths.length > 0 ? optionalFormPaths : undefined,
          };
        }

        const result: Record<string, unknown> = {
          ...serialized,
          id: doc.id,
          root_word: serialized.word,
          dictionary_entry: serialized.dictionary_entry ?? null,
          ...formFields,
        };
        for (const field of TABLE_FIELDS) {
          delete result[field];
        }
        return result;
      })
      .filter((word): word is NonNullable<typeof word> => word !== null);

    const hasMore = fetchAll
      ? false
      : poolId
        ? !!poolSourceMeta && poolSourceMeta.offset + poolSourceMeta.requestedCount < poolSourceMeta.totalIds
        : randomize || useRandomOrder
          ? false
          : snapshot.docs.length === fetchLimit;
    const lastDoc = fetchAll || poolId || randomize || useRandomOrder ? null : docs[docs.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        words: audience === 'generated' ? words.map(sanitizeGeneratedWord) : words,
        hasMore,
        lastWordId: lastDoc?.id || null,
        limit: fetchAll ? null : limit,
        filters: { wordType, search },
        collection,
        totalCount: fetchAll ? docs.length : undefined,
        nextPoolOffset: poolSourceMeta ? poolSourceMeta.offset + poolSourceMeta.requestedCount : undefined,
      },
    });
  } catch (error) {
    return errorResponse(error, 'fetching words');
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleVocabularyWordsGET(request, 'admin');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
        },
        { status: 400 }
      );
    }

    const { collection: providedCollection, ...wordPayload } = body as Record<string, unknown>;
    const collection = requireVocabularyWordsCollection(providedCollection);

    const now = new Date();
    const validationResult = VocabularyWordSchema.safeParse({
      ...wordPayload,
      sort_key: stripMacrons(typeof wordPayload.word === 'string' ? wordPayload.word : ''),
      random_index: Math.random(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues
        .map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');
      return NextResponse.json(
        {
          success: false,
          error: `Invalid word data: ${errorMessage}`,
        },
        { status: 400 }
      );
    }

    const firestorePayload = { ...validationResult.data, createdAt: now, updatedAt: now };

    const docRef = adminDb.collection(collection).doc();
    await runVocabularyContentMutation(adminDb, async transaction => {
      const applyContentRevision = await prepareVocabularyContentRevisionBump(transaction, adminDb);
      applyContentRevision();
      transaction.create(docRef, firestorePayload);
    });
    const createdSnapshot = await docRef.get();
    const createdWord = {
      id: createdSnapshot.id,
      ...serializeWord(createdSnapshot.data() as Record<string, unknown>),
    };

    return NextResponse.json({
      success: true,
      data: {
        word: createdWord,
      },
    });
  } catch (error) {
    return errorResponse(error, 'creating word');
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const body = await request.json();
    const { wordId, updates } = body;
    const collection = requireVocabularyWordsCollection(body.collection);

    if (!wordId || !updates) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId and updates are required',
        },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (typeof updates.word === 'string') {
      updateData.sort_key = stripMacrons(updates.word);
    }

    const existingRef = adminDb.collection(collection).doc(wordId);
    const updateResult = await runVocabularyContentMutation(adminDb, async transaction => {
      const existingSnapshot = await transaction.get(existingRef);
      if (!existingSnapshot.exists) return { status: 'not-found' as const };
      if (existingSnapshot.data()?._deletionPending) return { status: 'deleting' as const };

      const existingSerialized = serializeWord(existingSnapshot.data() as Record<string, unknown>);
      const validationCandidate: Record<string, unknown> = {
        ...existingSerialized,
        ...updates,
        ...(typeof updateData.sort_key === 'string' ? { sort_key: updateData.sort_key } : {}),
        updatedAt: new Date().toISOString(),
      };
      const validationResult = VocabularyWordSchema.safeParse(validationCandidate);
      if (!validationResult.success) {
        return { status: 'invalid' as const, issues: validationResult.error.issues };
      }

      const applyContentRevision = await prepareVocabularyContentRevisionBump(transaction, adminDb);
      transaction.update(existingRef, updateData as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
      applyContentRevision();
      return {
        status: 'updated' as const,
        data: { id: existingSnapshot.id, ...serializeWord({ ...existingSnapshot.data(), ...updateData }) },
      };
    });

    if (updateResult.status === 'not-found') {
      return NextResponse.json({ success: false, error: 'Word not found' }, { status: 404 });
    }
    if (updateResult.status === 'deleting') {
      return NextResponse.json(
        { success: false, error: 'Word deletion is already in progress', code: 'WORD_DELETE_IN_PROGRESS' },
        { status: 409 }
      );
    }
    if (updateResult.status === 'invalid') {
      const errorMessage = updateResult.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return NextResponse.json({ success: false, error: `Invalid word data: ${errorMessage}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Word updated successfully',
      updatedData: updateResult.data,
    });
  } catch (error) {
    return errorResponse(error, 'updating word');
  }
}

function getCellValuesAtPath(obj: Record<string, unknown>, path: string): string[] {
  let value: unknown = obj;
  for (const key of path.split('.')) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return [];
    }
  }

  if (typeof value === 'string') {
    return isSelectableMorphologyForm(value) ? [value] : [];
  }
  return Array.isArray(value) ? value.filter(isSelectableMorphologyForm) : [];
}

function pickRandomFormServer(
  word: Record<string, unknown>,
  tableType: TableType,
  selectedPaths: string[],
  selectedSteps: readonly FormIdentificationStep[]
) {
  const rootField = TABLE_TYPE_CONFIG[tableType];
  if (!rootField) {
    return null;
  }

  const table = word[rootField];
  if (!table) {
    return null;
  }

  const compatiblePaths = selectedSteps.length
    ? selectedPaths.filter(
        path => (getApplicableStepsForFormPath(path, tableType, selectedSteps)?.applicableSteps.length ?? 0) > 0
      )
    : selectedPaths;

  const formsWithPaths = compatiblePaths.flatMap(path =>
    getCellValuesAtPath(word, `${rootField}.${path}`).map(form => ({ form, path }))
  );
  if (formsWithPaths.length === 0) {
    return null;
  }

  const selected = formsWithPaths[Math.floor(Math.random() * formsWithPaths.length)];
  const { primaryPaths, optionalPaths } = categorizeMatchingPaths(
    scanTableForMatchingForms(table, selected.form),
    compatiblePaths
  );
  if (!primaryPaths.includes(selected.path)) {
    primaryPaths.unshift(selected.path);
  }

  return {
    selectedForm: selected.form,
    selectedPath: selected.path,
    primaryPaths,
    optionalPaths,
  };
}

async function getWordTypeCounts(collection: string) {
  const counts: Record<string, number> = Object.fromEntries(
    [...COUNTED_PARTS_OF_SPEECH, 'other'].map(partOfSpeech => [partOfSpeech, 0])
  );

  try {
    const results = await Promise.all(
      COUNTED_PARTS_OF_SPEECH.map(async partOfSpeech => {
        const snapshot = await adminDb.collection(collection).where('part_of_speech', '==', partOfSpeech).count().get();
        return [partOfSpeech, snapshot.data().count] as const;
      })
    );
    for (const [partOfSpeech, count] of results) {
      counts[partOfSpeech] = count;
    }
  } catch (error) {
    console.error('Error getting word type counts:', error);
  }
  return counts;
}
