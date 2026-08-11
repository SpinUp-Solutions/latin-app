import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { getReadableVocabularyPool, loadVocabularyPoolWords } from '@/src/lib/vocabulary-pools/archive.server';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { GeneratorFilters, FormSelection } from '@/src/types/exercises/base';
import type { FormParadigm, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import { PARADIGM_POS_GROUP, PARADIGM_TABLE_TYPE } from '@/src/config/paradigmDefinitions';
import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';
import { TABLE_TYPE_CONFIG, type TableType } from '@/src/utils/schema-helpers';
import { categorizeMatchingPaths, scanTableForMatchingForms } from '@/src/utils/tableScanner';
import { deriveTableTypeFromPOS } from '@/src/utils/generated/tableType';
import { filterOverlappingPronounParadigms } from '@/src/utils/generated/pronounParadigmFiltering';
import { stripMacrons } from '@/src/utils/exercises/helpers';
import {
  buildLegacyParadigmConfigs,
  buildLegacyPosConfigs,
  normalizeCollection,
} from '@/src/utils/exercises/legacyExerciseCompat';
import type { GeneratedExercise, GeneratedWordLoader } from './generated-exercises';

interface WordQuerySpec {
  partOfSpeech?: string;
  filters: Omit<GeneratorFilters, 'partOfSpeech'>;
  formSelection?: FormSelection;
  tableType?: TableType;
}

const shuffle = <T>(values: T[]): T[] => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

export const applyValueFilter = (query: Query, field: string, value?: string): Query => {
  if (!value || value === 'all' || value === 'both') return query;
  const values = value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  if (values.length === 0) return query;
  return values.length === 1 ? query.where(field, '==', values[0]) : query.where(field, 'in', values);
};

function applyFilters(query: Query, spec: WordQuerySpec): Query {
  const filters = spec.filters;
  if (spec.partOfSpeech) query = query.where('part_of_speech', '==', spec.partOfSpeech);

  if (spec.partOfSpeech === 'verb') {
    query = applyValueFilter(query, 'conjugation', filters.verbConjugation);
    if (filters.isDeponent === 'true') query = query.where('is_deponent', '==', true);
    if (filters.isDeponent === 'false') query = query.where('is_deponent', '==', false);
  } else if (spec.partOfSpeech === 'noun') {
    query = applyValueFilter(query, 'declension', filters.nounDeclension);
  } else if (spec.partOfSpeech === 'adjective') {
    query = applyValueFilter(query, 'declension', filters.adjectiveDeclension);
  } else if (spec.partOfSpeech === 'pronoun') {
    query = applyValueFilter(query, 'pronoun_type', filters.pronounType);
    query = applyValueFilter(query, 'person', filters.pronounPerson);
  }

  return query;
}

const getParadigmConfigs = (
  exercise: Extract<GeneratedExercise, { type: 'generated-form-identification' }>
): ParadigmConfigs => {
  const config = exercise.data.generatorConfig;
  return Object.keys(exercise.data.paradigmConfigs || {}).length
    ? exercise.data.paradigmConfigs
    : buildLegacyParadigmConfigs(config as Parameters<typeof buildLegacyParadigmConfigs>[0]);
};

const getQuerySpecs = (exercise: GeneratedExercise): WordQuerySpec[] => {
  if (exercise.type === 'generated-translation') {
    const config = exercise.data.generatorConfig;
    const posConfigs = Object.keys(exercise.data.posConfigs || {}).length
      ? exercise.data.posConfigs
      : buildLegacyPosConfigs(config as Parameters<typeof buildLegacyPosConfigs>[0]);
    return Object.entries(posConfigs)
      .filter(([, value]) => value?.enabled)
      .map(([partOfSpeech, value]) => ({
        partOfSpeech,
        filters: value!.filters,
        formSelection: value!.formSelection,
        tableType: deriveTableTypeFromPOS(partOfSpeech, value!.filters.pronounType, value!.filters.pronounPerson),
      }));
  }

  const paradigmConfigs = getParadigmConfigs(exercise);

  return Object.entries(paradigmConfigs)
    .filter((entry): entry is [FormParadigm, NonNullable<(typeof entry)[1]>] => entry[1]?.enabled === true)
    .map(([paradigm, value]) => {
      const filters = { ...value.filters };
      if (paradigm === 'pronoun-personal') {
        filters.pronounType = 'personal';
        filters.pronounPerson = '1st,2nd';
      } else if (paradigm === 'pronoun-gendered' && filters.pronounType === 'personal') {
        filters.pronounPerson = '3rd';
      }
      return {
        partOfSpeech: PARADIGM_POS_GROUP[paradigm],
        filters,
        formSelection: value.formSelection,
        tableType: PARADIGM_TABLE_TYPE[paradigm],
      };
    });
};

const getPathValues = (value: Record<string, unknown>, path: string): string[] => {
  let current: unknown = value;
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || !(key in current)) return [];
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current === 'string') return [current];
  return Array.isArray(current) ? current.filter((entry): entry is string => typeof entry === 'string') : [];
};

function selectForm(word: Record<string, unknown>, tableType: TableType, selectedPaths: string[]) {
  const tableField = TABLE_TYPE_CONFIG[tableType];
  const table = word[tableField];
  if (!table) return null;

  const candidates = selectedPaths.flatMap(path =>
    getPathValues(word, `${tableField}.${path}`).map(form => ({ form, path }))
  );
  if (!candidates.length) return null;

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  const matchingPaths = scanTableForMatchingForms(table, selected.form, tableType);
  const paths = categorizeMatchingPaths(matchingPaths, selectedPaths);
  if (!paths.primaryPaths.includes(selected.path)) paths.primaryPaths.unshift(selected.path);
  return { selected, ...paths };
}

function mapWord(doc: QueryDocumentSnapshot, spec: WordQuerySpec): ExerciseWordResponse | null {
  const data = doc.data() as Record<string, unknown>;
  const selectedPaths = spec.formSelection?.selectedCellPaths || [];
  const selection = spec.tableType && selectedPaths.length ? selectForm(data, spec.tableType, selectedPaths) : null;
  if (selectedPaths.length && !selection) return null;

  const parsedTableType = spec.tableType;
  const formPath =
    selection && parsedTableType ? parseFormPathFromString(selection.selected.path, parsedTableType) : null;
  const primary =
    selection && parsedTableType
      ? selection.primaryPaths.map(path => parseFormPathFromString(path, parsedTableType)).filter(Boolean)
      : undefined;
  const optional =
    selection && parsedTableType
      ? selection.optionalPaths.map(path => parseFormPathFromString(path, parsedTableType)).filter(Boolean)
      : undefined;

  const result = {
    id: doc.id,
    root_word: String(data.word || ''),
    dictionary_entry: typeof data.dictionary_entry === 'string' ? data.dictionary_entry : null,
    selected_form: selection?.selected.form || String(data.word || ''),
    part_of_speech: data.part_of_speech,
    form_path: formPath,
    primary_form_paths: primary?.length ? primary : undefined,
    optional_form_paths: optional?.length ? optional : undefined,
    ...(typeof data.conjugation === 'string' ? { conjugation: data.conjugation } : {}),
    ...(typeof data.declension === 'string' ? { declension: data.declension } : {}),
    ...(Array.isArray(data.definitions)
      ? { definitions: data.definitions.filter(value => typeof value === 'string') }
      : {}),
    ...(typeof data.is_deponent === 'boolean' ? { is_deponent: data.is_deponent } : {}),
    ...(typeof data.translation === 'string' ? { translation: data.translation } : {}),
    ...(typeof data.gender === 'string' ? { gender: data.gender } : {}),
    ...(typeof data.pronoun_type === 'string' ? { pronoun_type: data.pronoun_type } : {}),
    ...(typeof data.person === 'string' || data.person === null ? { person: data.person } : {}),
  };
  return result as ExerciseWordResponse;
}

export function requireGeneratedVocabularyCollection(collection?: string): string {
  if (!collection || collection === VOCABULARY_WORDS_COLLECTION) return VOCABULARY_WORDS_COLLECTION;
  if (/^vocabulary_words_v\d+$/.test(collection)) return VOCABULARY_WORDS_COLLECTION;
  throw new Error('Generated exercises must use the configured vocabulary collection');
}

async function loadPoolDocuments(db: Firestore, poolId: string, limit?: number | 'all') {
  const pool = await getReadableVocabularyPool(db, poolId);
  if (!pool) throw new Error(`Vocabulary pool ${poolId} was not found`);
  const wordIds = Array.isArray(pool.data.wordDocIds)
    ? pool.data.wordDocIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
    : [];
  const selectedWordIds =
    limit === 'all' || limit === undefined || limit >= wordIds.length ? wordIds : shuffle(wordIds).slice(0, limit);
  return loadVocabularyPoolWords(pool, selectedWordIds);
}

async function loadQueryDocuments(db: Firestore, collection: string, spec: WordQuerySpec, count: number | 'all') {
  const baseQuery = () => applyFilters(db.collection(collection), spec);
  let query = baseQuery();
  if (spec.filters.search) {
    const search = stripMacrons(spec.filters.search);
    query = query.where('sort_key', '>=', search).where('sort_key', '<=', `${search}\uf8ff`).orderBy('sort_key');
    if (count !== 'all') query = query.limit(count);
    return (await query.get()).docs;
  }

  if (count === 'all') return (await query.orderBy('random_index').get()).docs;

  const threshold = Math.random();
  const first = await query.orderBy('random_index').where('random_index', '>=', threshold).limit(count).get();
  if (first.size >= count) return first.docs;

  const remaining = count - first.size;
  const wrapped = await baseQuery()
    .orderBy('random_index')
    .where('random_index', '<', threshold)
    .limit(remaining)
    .get();
  return [...first.docs, ...wrapped.docs];
}

export function createFirestoreGeneratedWordLoader(db: Firestore): GeneratedWordLoader {
  return async exercise => {
    const config = exercise.data.generatorConfig;
    const collection = requireGeneratedVocabularyCollection(
      normalizeCollection(config.collection || VOCABULARY_WORDS_COLLECTION)
    );
    const specs = getQuerySpecs(exercise);
    const count = config.count || 'all';
    const poolId = config.wordSource === 'pool' ? config.poolId : null;

    if (poolId) {
      const documents = await loadPoolDocuments(db, poolId, config.poolWordLimit || 'all');
      const activeSpecs = specs.length ? specs : [{ filters: {} }];
      const words = activeSpecs.flatMap(spec =>
        documents
          .filter(doc => !spec.partOfSpeech || doc.data().part_of_speech === spec.partOfSpeech)
          .map(doc => mapWord(doc, spec))
          .filter((word): word is ExerciseWordResponse => word !== null)
      );
      return shuffle(
        exercise.type === 'generated-form-identification'
          ? filterOverlappingPronounParadigms(words, getParadigmConfigs(exercise))
          : words
      );
    }

    const documents = await Promise.all(specs.map(spec => loadQueryDocuments(db, collection, spec, count)));
    const words = documents.flatMap((docs, index) =>
      docs.map(doc => mapWord(doc, specs[index])).filter((word): word is ExerciseWordResponse => word !== null)
    );
    return shuffle(
      exercise.type === 'generated-form-identification'
        ? filterOverlappingPronounParadigms(words, getParadigmConfigs(exercise))
        : words
    );
  };
}
