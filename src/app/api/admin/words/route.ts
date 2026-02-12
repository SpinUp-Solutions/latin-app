import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query, FieldPath } from 'firebase-admin/firestore';
import { VocabularyWordSchema } from '@/shared/types/vocabulary/schemas';
import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';
import { TABLE_TYPE_CONFIG, type TableType } from '@/src/utils/schema-helpers';
import { scanTableForMatchingForms, categorizeMatchingPaths } from '@/src/utils/tableScanner';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

const DEFAULT_COLLECTION = VOCABULARY_WORDS_COLLECTION;
const TABLE_FIELDS = ['word', 'conjugation_table', 'declension_table', 'degrees_table'] as const;

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

const stripMacrons = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0304]/g, '')
    .normalize('NFC');
};

const parseCellPaths = (cellPaths: string | null): string[] => {
  if (!cellPaths) return [];
  return cellPaths
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);
};

const parseSelectFields = (selectFields: string | null): string[] => {
  if (!selectFields) return [];
  return selectFields
    .split(',')
    .map(f => f.trim())
    .filter(f => f.length > 0);
};

const shuffleArray = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const pickPoolWordIds = (wordDocIds: string[], limitCount: number, fetchAllWords: boolean): string[] => {
  if (fetchAllWords || limitCount >= wordDocIds.length) {
    return [...wordDocIds];
  }
  const sampleSize = Math.max(1, Math.min(limitCount, wordDocIds.length));
  const shuffled = shuffleArray(wordDocIds);
  return shuffled.slice(0, sampleSize);
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const wordType = searchParams.get('wordType');
    const limit = parseInt(searchParams.get('limit') || '20');
    const lastWordId = searchParams.get('lastWordId');
    const search = searchParams.get('search');
    const countsOnly = searchParams.get('countsOnly') === 'true';
    const collection = searchParams.get('collection') || DEFAULT_COLLECTION;
    const verbConjugation = searchParams.get('verbConjugation');
    const isDeponent = searchParams.get('isDeponent');
    const nounDeclension = searchParams.get('nounDeclension');
    const adjectiveDeclension = searchParams.get('adjectiveDeclension');
    const pronounType = searchParams.get('pronounType');
    const pronounPerson = searchParams.get('pronounPerson');
    const cellPaths = searchParams.get('cellPaths');
    const tableType = searchParams.get('tableType');
    const selectFields = searchParams.get('select');
    const fetchAll = searchParams.get('fetchAll') === 'true';
    const randomize = !fetchAll && searchParams.get('randomize') === 'true';
    const randomStart = searchParams.get('randomStart');
    const poolId = searchParams.get('poolId');

    if (countsOnly) {
      const wordTypeCounts = await getWordTypeCounts(collection);
      return NextResponse.json({
        success: true,
        data: {
          wordTypeCounts,
        },
      });
    }

    let snapshot;
    let fetchLimit = limit;
    let poolSourceMeta: { totalIds: number; requestedCount: number } | null = null;

    if (poolId) {
      const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
      if (!poolDoc.exists) {
        return NextResponse.json(
          {
            success: false,
            error: 'Pool not found',
          },
          { status: 404 }
        );
      }

      const poolData = poolDoc.data();
      const wordDocIds = (poolData?.wordDocIds || []) as string[];

      if (wordDocIds.length === 0) {
        snapshot = { docs: [], size: 0, empty: true };
        poolSourceMeta = { totalIds: 0, requestedCount: 0 };
      } else {
        const idsToFetch = pickPoolWordIds(wordDocIds, limit, fetchAll);
        poolSourceMeta = { totalIds: wordDocIds.length, requestedCount: idsToFetch.length };

        if (idsToFetch.length === 0) {
          snapshot = { docs: [], size: 0, empty: true };
        } else {
          const fields = parseSelectFields(selectFields);
          const batches = [];
          for (let i = 0; i < idsToFetch.length; i += 10) {
            const chunk = idsToFetch.slice(i, i + 10);
            let batchQuery: Query = adminDb.collection(collection).where(FieldPath.documentId(), 'in', chunk);
            if (fields.length > 0) {
              batchQuery = batchQuery.select(...fields);
            }
            batches.push(batchQuery.get());
          }

          const batchResults = await Promise.all(batches);
          let docsFromPool = batchResults.flatMap(result => result.docs);

          if (wordType && wordType !== 'all') {
            docsFromPool = docsFromPool.filter(doc => {
              const data = doc.data();
              return data.part_of_speech === wordType;
            });
          }

          snapshot = {
            docs: docsFromPool,
            size: docsFromPool.length,
            empty: docsFromPool.length === 0,
          };
        }
      }
    } else {
      console.log('[VOCAB API] Querying collection:', collection);
      let query: Query = adminDb.collection(collection);

      const fields = parseSelectFields(selectFields);
      if (fields.length > 0) {
        query = query.select(...fields);
      }

      // Determine if using random ordering (for exercise generation)
      const useRandomOrder = randomStart !== null && !search && !lastWordId;
      const randomThreshold = useRandomOrder ? parseFloat(randomStart) : null;

      if (useRandomOrder && randomThreshold !== null) {
        console.log('[VOCAB API] Using random ordering with threshold:', randomThreshold);
        query = query.orderBy('random_index');
        query = query.where('random_index', '>=', randomThreshold);
      } else {
        console.log('[VOCAB API] Ordering by: sort_key');
        query = query.orderBy('sort_key');
      }

      if (wordType) {
        console.log('[VOCAB API] Filtering by part_of_speech:', wordType);
        query = query.where('part_of_speech', '==', wordType);
      }

      if (search) {
        const searchKey = stripMacrons(search);
        query = query.where('sort_key', '>=', searchKey).where('sort_key', '<=', searchKey + '\uf8ff');
      }

      if (wordType === 'verb') {
        if (verbConjugation) {
          query = query.where('conjugation', '==', verbConjugation);
        }
        if (isDeponent === 'true') {
          query = query.where('is_deponent', '==', true);
        } else if (isDeponent === 'false') {
          query = query.where('is_deponent', '==', false);
        }
      } else if (wordType === 'noun' && nounDeclension) {
        query = query.where('declension', '==', nounDeclension);
      } else if (wordType === 'adjective' && adjectiveDeclension) {
        query = query.where('declension', '==', adjectiveDeclension);
      } else if (wordType === 'pronoun') {
        if (pronounType) {
          query = query.where('pronoun_type', '==', pronounType);
        }
        if (pronounPerson) {
          const persons = pronounPerson.split(',').map(p => p.trim());
          if (persons.length === 1) {
            query = query.where('person', '==', persons[0]);
          } else {
            query = query.where('person', 'in', persons);
          }
        }
      }

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

      console.log('[VOCAB API] Executing query...');
      snapshot = await query.get();
      console.log('[VOCAB API] Query returned', snapshot.size, 'documents');

      // Wrap-around: if using random order and didn't get enough results, fetch from beginning
      if (useRandomOrder && randomThreshold !== null && !fetchAll && snapshot.docs.length < limit) {
        const remaining = limit - snapshot.docs.length;
        console.log('[VOCAB API] Wrap-around: need', remaining, 'more words from beginning');

        let wrapQuery: Query = adminDb.collection(collection);
        if (fields.length > 0) {
          wrapQuery = wrapQuery.select(...fields);
        }
        wrapQuery = wrapQuery.orderBy('random_index');
        wrapQuery = wrapQuery.where('random_index', '<', randomThreshold);

        if (wordType) {
          wrapQuery = wrapQuery.where('part_of_speech', '==', wordType);
        }
        if (wordType === 'verb') {
          if (verbConjugation) {
            wrapQuery = wrapQuery.where('conjugation', '==', verbConjugation);
          }
          if (isDeponent === 'true') {
            wrapQuery = wrapQuery.where('is_deponent', '==', true);
          } else if (isDeponent === 'false') {
            wrapQuery = wrapQuery.where('is_deponent', '==', false);
          }
        } else if (wordType === 'noun' && nounDeclension) {
          wrapQuery = wrapQuery.where('declension', '==', nounDeclension);
        } else if (wordType === 'adjective' && adjectiveDeclension) {
          wrapQuery = wrapQuery.where('declension', '==', adjectiveDeclension);
        } else if (wordType === 'pronoun') {
          if (pronounType) {
            wrapQuery = wrapQuery.where('pronoun_type', '==', pronounType);
          }
          if (pronounPerson) {
            const persons = pronounPerson.split(',').map(p => p.trim());
            if (persons.length === 1) {
              wrapQuery = wrapQuery.where('person', '==', persons[0]);
            } else {
              wrapQuery = wrapQuery.where('person', 'in', persons);
            }
          }
        }

        wrapQuery = wrapQuery.limit(remaining);
        const wrapSnapshot = await wrapQuery.get();
        console.log('[VOCAB API] Wrap-around query returned', wrapSnapshot.size, 'documents');

        // Combine results
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

    console.log('[VOCAB API] Processing', docs.length, 'documents');

    const words = docs
      .map(doc => {
        const data = doc.data();
        const serialized = serializeWord(data as Record<string, unknown>);
        const isExerciseMode = !!tableType;

        if (isExerciseMode) {
          const paths = parseCellPaths(cellPaths);

          if (paths.length > 0 && tableType) {
            const formResult = pickRandomFormServer(serialized, tableType as TableType, paths);

            if (!formResult) {
              return null;
            }

            const formPath = parseFormPathFromString(
              formResult.selectedPath,
              tableType as 'conjugation' | 'declension' | 'adjective-declension'
            );

            const primaryFormPaths = formResult.primaryPaths
              .map(p => parseFormPathFromString(p, tableType as 'conjugation' | 'declension' | 'adjective-declension'))
              .filter((fp): fp is NonNullable<typeof fp> => fp !== null);

            const optionalFormPaths = formResult.optionalPaths
              .map(p => parseFormPathFromString(p, tableType as 'conjugation' | 'declension' | 'adjective-declension'))
              .filter((fp): fp is NonNullable<typeof fp> => fp !== null);

            const result = {
              ...serialized,
              id: doc.id,
              root_word: serialized.word,
              dictionary_entry: (serialized.dictionary_entry as string) ?? null,
              selected_form: formResult.selectedForm,
              form_path: formPath,
              primary_form_paths: primaryFormPaths.length > 0 ? primaryFormPaths : undefined,
              optional_form_paths: optionalFormPaths.length > 0 ? optionalFormPaths : undefined,
            } as Record<string, unknown>;

            for (const field of TABLE_FIELDS) {
              delete result[field];
            }

            return result;
          }

          const result = {
            ...serialized,
            id: doc.id,
            root_word: serialized.word,
            dictionary_entry: (serialized.dictionary_entry as string) ?? null,
            selected_form: serialized.word as string,
            form_path: null,
            primary_form_paths: undefined,
            optional_form_paths: undefined,
          } as Record<string, unknown>;

          for (const field of TABLE_FIELDS) {
            delete result[field];
          }

          return result;
        } else {
          return {
            id: doc.id,
            ...serialized,
          };
        }
      })
      .filter((word): word is NonNullable<typeof word> => word !== null);

    console.log('[VOCAB API] Mapped to', words.length, 'words');
    if (words.length > 0) {
      console.log('[VOCAB API] First word:', {
        id: words[0].id,
        word: words[0].word,
        sort_key: words[0].sort_key,
        part_of_speech: words[0].part_of_speech,
      });
    }

    const useRandomOrder = randomStart !== null && !search && !lastWordId;
    const hasMore = fetchAll
      ? false
      : poolId
        ? !!poolSourceMeta && poolSourceMeta.requestedCount < poolSourceMeta.totalIds
        : randomize || useRandomOrder
          ? false
          : snapshot.docs.length === fetchLimit;
    const lastDoc = fetchAll || poolId || randomize || useRandomOrder ? null : docs[docs.length - 1];

    console.log('[VOCAB API] Returning response with', words.length, 'words, hasMore:', hasMore);

    return NextResponse.json({
      success: true,
      data: {
        words,
        hasMore,
        lastWordId: lastDoc?.id || null,
        limit: fetchAll ? null : limit,
        filters: { wordType, search },
        collection,
        totalCount: fetchAll ? docs.length : undefined,
      },
    });
  } catch (error) {
    console.error('Error fetching words:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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

    const { collection: providedCollection, ...wordPayload } = body as Record<string, unknown> & {
      collection?: string;
      id?: string;
    };

    const collection =
      typeof providedCollection === 'string' && providedCollection.trim() !== ''
        ? providedCollection
        : DEFAULT_COLLECTION;

    const now = new Date();
    const isoTimestamp = now.toISOString();

    const wordValue = typeof wordPayload.word === 'string' ? wordPayload.word : '';
    const sortKey = stripMacrons(wordValue);
    const randomIndex = Math.random();

    const validationResult = VocabularyWordSchema.safeParse({
      ...wordPayload,
      sort_key: sortKey,
      random_index: randomIndex,
      createdAt: isoTimestamp,
      updatedAt: isoTimestamp,
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

    const { createdAt, updatedAt, ...validatedWord } = validationResult.data;
    void createdAt;
    void updatedAt;

    const firestorePayload = {
      ...validatedWord,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection(collection).add(firestorePayload);
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
    console.error('Error creating word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { wordId, updates, collection = DEFAULT_COLLECTION } = body;

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
    const existingSnapshot = await existingRef.get();
    if (!existingSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: 'Word not found',
        },
        { status: 404 }
      );
    }

    const existingSerialized = serializeWord(existingSnapshot.data() as Record<string, unknown>);
    const validationCandidate: Record<string, unknown> = {
      ...existingSerialized,
      ...updates,
      ...(typeof updateData.sort_key === 'string' ? { sort_key: updateData.sort_key } : {}),
      updatedAt: new Date().toISOString(),
    };

    const validationResult = VocabularyWordSchema.safeParse(validationCandidate);
    if (!validationResult.success) {
      console.error('[VOCAB API] Update validation failed', {
        wordId,
        collection,
        part_of_speech: validationCandidate.part_of_speech,
        issues: validationResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });

      const errorMessage = validationResult.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return NextResponse.json({ success: false, error: `Invalid word data: ${errorMessage}` }, { status: 400 });
    }

    await adminDb.collection(collection).doc(wordId).update(updateData);

    const updatedDoc = await adminDb.collection(collection).doc(wordId).get();
    const updatedData = {
      id: updatedDoc.id,
      ...serializeWord(updatedDoc.data() as Record<string, unknown>),
    };

    return NextResponse.json({
      success: true,
      message: 'Word updated successfully',
      updatedData,
    });
  } catch (error) {
    console.error('Error updating word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

function getCellValueAtPathServer(obj: Record<string, unknown>, path: string): string[] {
  const keys = path.split('.');
  let value: unknown = obj;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return [];
    }
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    const filtered = value.filter((v): v is string => v !== null && v !== undefined && typeof v === 'string');
    return filtered;
  }
  return [];
}

interface FormSelectionResult {
  selectedForm: string;
  selectedPath: string;
  primaryPaths: string[];
  optionalPaths: string[];
}

function pickRandomFormServer(
  word: Record<string, unknown>,
  tableType: TableType,
  selectedPaths: string[]
): FormSelectionResult | null {
  const rootField = TABLE_TYPE_CONFIG[tableType];
  if (!rootField) {
    return null;
  }

  const table = word[rootField];
  if (!table) {
    return null;
  }

  const formsWithPaths: Array<{ form: string; path: string }> = [];

  for (const path of selectedPaths) {
    const fullPath = `${rootField}.${path}`;
    const forms = getCellValueAtPathServer(word, fullPath);

    for (const form of forms) {
      formsWithPaths.push({ form, path });
    }
  }

  if (formsWithPaths.length === 0) {
    return null;
  }

  const selected = formsWithPaths[Math.floor(Math.random() * formsWithPaths.length)];

  const allMatchingPaths = scanTableForMatchingForms(table, selected.form, tableType);

  const { primaryPaths, optionalPaths } = categorizeMatchingPaths(allMatchingPaths, selectedPaths);

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
  const posTypes = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'pronoun', 'conjunction', 'interjection'] as const;

  const counts: Record<string, number> = {
    noun: 0,
    verb: 0,
    adjective: 0,
    adverb: 0,
    preposition: 0,
    pronoun: 0,
    conjunction: 0,
    interjection: 0,
    other: 0,
  };

  try {
    const countPromises = posTypes.map(async pos => {
      const snapshot = await adminDb
        .collection(collection)
        .where('part_of_speech', '==', pos)
        .count()
        .get();
      return { pos, count: snapshot.data().count };
    });

    const results = await Promise.all(countPromises);
    for (const { pos, count } of results) {
      counts[pos] = count;
    }

    return counts;
  } catch (error) {
    console.error('Error getting word type counts:', error);
    return counts;
  }
}
