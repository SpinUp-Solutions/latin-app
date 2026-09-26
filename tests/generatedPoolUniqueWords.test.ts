jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));

import { createFakeGeneratedWordDb, type FakeDocument } from './helpers/fakeGeneratedWordFirestore';
import {
  collectWordsForGeneratedExerciseRequest,
  createFirestoreGeneratedWordLoader,
} from '@/src/lib/tests/generated-word-loader.server';
import {
  collectGeneratedExerciseWords,
  createGeneratedExerciseRng,
  type WordQuerySpec,
} from '@/src/lib/tests/generated-word-composition.server';
import {
  resolveGeneratedExerciseItems,
  type ResolvedFormIdentificationItem,
} from '@/src/lib/tests/generated-exercises';
import { gradeExercisePercentage } from '@/src/lib/tests/grading';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { GeneratedFormIdentificationExercise, GeneratedTranslationExercise } from '@/src/types/exercises';
import type { GeneratorConfigBase } from '@/src/types/exercises/base';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';

const POOL_ID = 'form-pool';
const VERB_CELLS = [
  'singular.first',
  'singular.second',
  'singular.third',
  'plural.first',
  'plural.second',
  'plural.third',
] as const;
const VERB_PATHS = VERB_CELLS.map(cell => `indicative.active.present.${cell}`);
const NOUN_CELLS = ['singular.nominative', 'singular.accusative', 'plural.nominative', 'plural.accusative'] as const;

const verbDoc = (id: string, forms: Array<string | null>, extras: Record<string, unknown> = {}): FakeDocument => {
  const present: Record<string, Record<string, string[]>> = { singular: {}, plural: {} };
  VERB_CELLS.forEach((cell, index) => {
    const [number, person] = cell.split('.');
    present[number][person] = [forms[index] ?? '—'];
  });
  return {
    id,
    data: {
      word: id,
      part_of_speech: 'verb',
      translation: 'love',
      random_index: 0.5,
      sort_key: id,
      conjugation_table: { indicative: { active: { present } } },
      ...extras,
    },
  };
};

const verbWithFormCount = (id: string, formCount: number) =>
  verbDoc(
    id,
    VERB_CELLS.map((_, index) => (index < formCount ? `${id}-f${index}` : null))
  );

const nounDoc = (id: string): FakeDocument => {
  const table: Record<string, Record<string, string[]>> = { singular: {}, plural: {} };
  NOUN_CELLS.forEach((cell, index) => {
    const [number, grammaticalCase] = cell.split('.');
    table[number][grammaticalCase] = [`${id}-f${index}`];
  });
  return { id, data: { word: id, part_of_speech: 'noun', declension: '1', declension_table: table } };
};

const verbParadigm = {
  enabled: true,
  filters: {},
  steps: ['person', 'number'] as FormIdentificationStep[],
  formSelection: { tableType: 'conjugation' as const, selectedCellPaths: VERB_PATHS },
};

function uniqueWordExercise(
  config: Partial<GeneratorConfigBase> = {},
  data: Partial<GeneratedFormIdentificationExercise['data']> = {}
): GeneratedFormIdentificationExercise {
  return {
    id: 'unique-words',
    type: 'generated-form-identification',
    title: 'Pool morphology',
    instructions: '',
    feedbackConfig: { escalationLevels: [] },
    data: {
      mode: 'single-field',
      generatorConfig: {
        collection: 'vocabulary_words_v5',
        wordSource: 'pool',
        poolId: POOL_ID,
        count: 30,
        uniqueWordCount: 10,
        ...config,
      },
      paradigmConfigs: { 'verb-conjugation': verbParadigm },
      ...data,
    },
  } as GeneratedFormIdentificationExercise;
}

const poolDb = (words: FakeDocument[], wordDocIds = words.map(word => word.id)) =>
  createFakeGeneratedWordDb({ words, pools: [{ id: POOL_ID, wordDocIds }] });

async function collect(
  words: FakeDocument[],
  exercise: GeneratedFormIdentificationExercise | GeneratedTranslationExercise,
  seed = 1,
  wordDocIds?: string[]
) {
  return collectWordsForGeneratedExerciseRequest(poolDb(words, wordDocIds) as never, exercise, {
    rng: createGeneratedExerciseRng(seed),
  });
}

const countsById = (words: ExerciseWordResponse[]) =>
  words.reduce((counts, word) => counts.set(word.id, (counts.get(word.id) ?? 0) + 1), new Map<string, number>());

const expectEveryFormDistinct = (words: ExerciseWordResponse[]) =>
  expect(new Set(words.map(word => `${word.id}|${word.selected_form}`)).size).toBe(words.length);

const expectNoBackToBackWord = (words: ExerciseWordResponse[]) =>
  words.slice(1).forEach((word, index) => expect(word.id).not.toBe(words[index].id));

const range = (length: number) => Array.from({ length }, (_, index) => index);

describe('pool generation with a unique-word limit', () => {
  it.each([1, 7, 19, 101])(
    'rotates 10 unique words through different forms to fill 30 questions (seed %s)',
    async seed => {
      const words = range(50).map(index => verbWithFormCount(`verb-${index}`, 6));
      const result = await collect(words, uniqueWordExercise(), seed);

      expect(result.words).toHaveLength(30);
      expect(result.uniqueWords).toBe(10);
      expect([...countsById(result.words).values()]).toEqual(Array(10).fill(3));
      expectEveryFormDistinct(result.words);
      expectNoBackToBackWord(result.words);
      expect(result.diagnostics).toEqual([expect.objectContaining({ specId: 'verb-conjugation', collected: 30 })]);
    }
  );

  it('returns as many questions as the chosen words have distinct forms', async () => {
    const words = range(50).map(index => verbWithFormCount(`verb-${index}`, 2));
    const result = await collect(words, uniqueWordExercise());

    expect(result.words).toHaveLength(20);
    expect(result.uniqueWords).toBe(10);
    expect([...countsById(result.words).values()]).toEqual(Array(10).fill(2));
    expectEveryFormDistinct(result.words);
  });

  it.each([3, 11, 42])('fills from form-rich words when others run out (seed %s)', async seed => {
    const formCount = (index: number) => (index % 2 === 0 ? 1 : 6);
    const words = range(50).map(index => verbWithFormCount(`verb-${index}`, formCount(index)));
    const result = await collect(words, uniqueWordExercise(), seed);

    const counts = countsById(result.words);
    const capacity = [...counts.keys()].reduce((sum, id) => sum + formCount(Number(id.split('-')[1])), 0);
    expect(counts.size).toBe(10);
    expect(result.words).toHaveLength(Math.min(30, capacity));
    counts.forEach((count, id) => expect(count).toBeLessThanOrEqual(formCount(Number(id.split('-')[1]))));
    expectEveryFormDistinct(result.words);
  });

  it('treats syncretic cells with the same spelling as one form', async () => {
    const words = ['a', 'b'].map(id => verbDoc(id, [`${id}-1`, `${id}-2`, `${id}-x`, `${id}-4`, `${id}-5`, `${id}-x`]));
    const result = await collect(words, uniqueWordExercise({ uniqueWordCount: 2 }));

    expect(result.words).toHaveLength(10);
    expect([...countsById(result.words).values()]).toEqual([5, 5]);
    expectEveryFormDistinct(result.words);
    const syncretic = result.words.filter(word => word.selected_form.endsWith('-x'));
    expect(syncretic).toHaveLength(2);
    syncretic.forEach(word => expect(word.primary_form_paths).toHaveLength(2));
  });

  it('skips missing, deletion-pending, formless, and duplicate pool references when choosing words', async () => {
    const valid = range(10).map(index => verbWithFormCount(`valid-${index}`, 6));
    const pending = verbWithFormCount('pending', 6);
    pending.data._deletionPending = true;
    const words = [...valid, pending, verbWithFormCount('formless', 0)];
    const result = await collect(words, uniqueWordExercise(), 1, [
      ...words.map(word => word.id),
      'missing-word',
      'valid-0',
    ]);

    expect(result.words).toHaveLength(30);
    expect(result.uniqueWords).toBe(10);
    expect(new Set(result.words.map(word => word.id))).toEqual(new Set(valid.map(word => word.id)));
  });

  it('uses a different word for every question when the limit is at least the question count', async () => {
    const words = range(50).map(index => verbWithFormCount(`verb-${index}`, 6));
    const result = await collect(words, uniqueWordExercise({ uniqueWordCount: 40 }));

    expect(result.words).toHaveLength(30);
    expect(result.uniqueWords).toBe(30);
    expect(countsById(result.words).size).toBe(30);
  });

  it('keeps one word per question when no limit is saved', async () => {
    const words = range(50).map(index => verbWithFormCount(`verb-${index}`, 6));
    const result = await collect(words, uniqueWordExercise({ uniqueWordCount: null }));

    expect(result.words).toHaveLength(30);
    expect(countsById(result.words).size).toBe(30);
    expect(result.uniqueWords).toBeUndefined();
  });

  it('ignores the limit for saved all-word exercises', async () => {
    const words = range(17).map(index => verbWithFormCount(`verb-${index}`, 6));
    const result = await collect(words, uniqueWordExercise({ count: 'all', uniqueWordCount: 5 }));

    expect(result.words).toHaveLength(17);
    expect(countsById(result.words).size).toBe(17);
    expect(result.uniqueWords).toBeUndefined();
  });

  it('ignores the limit for filter-based sources', async () => {
    const words = range(20).map(index => verbWithFormCount(`verb-${index}`, 6));
    const result = await collect(
      words,
      uniqueWordExercise({ wordSource: 'filters', poolId: null, count: 12, uniqueWordCount: 3 })
    );

    expect(result.words).toHaveLength(12);
    expect(countsById(result.words).size).toBe(12);
    expect(result.uniqueWords).toBeUndefined();
  });

  it('ignores the limit for generated translation', async () => {
    const words = range(20).map(index => verbWithFormCount(`verb-${index}`, 6));
    const exercise = {
      id: 'translation',
      type: 'generated-translation',
      translationDirection: 'latin-to-english',
      data: {
        generatorConfig: {
          collection: 'vocabulary_words_v5',
          wordSource: 'pool',
          poolId: POOL_ID,
          count: 12,
          uniqueWordCount: 3,
        },
        posConfigs: {
          verb: { enabled: true, filters: {}, formSelection: verbParadigm.formSelection },
        },
      },
    } as GeneratedTranslationExercise;
    const result = await collect(words, exercise);

    expect(result.words).toHaveLength(12);
    expect(countsById(result.words).size).toBe(12);
  });

  it('shares unique words fairly across paradigms', async () => {
    const words = [
      ...range(10).map(index => verbWithFormCount(`verb-${index}`, 6)),
      ...range(10).map(index => nounDoc(`noun-${index}`)),
    ];
    const exercise = uniqueWordExercise(
      { count: 12, uniqueWordCount: 4 },
      {
        paradigmConfigs: {
          'verb-conjugation': verbParadigm,
          'noun-declension': {
            enabled: true,
            filters: {},
            steps: ['case', 'number'],
            formSelection: { tableType: 'declension', selectedCellPaths: [...NOUN_CELLS] },
          },
        },
      }
    );
    const result = await collect(words, exercise, 5);

    expect(result.words).toHaveLength(12);
    expect(result.uniqueWords).toBe(4);
    expect([...countsById(result.words).values()]).toEqual([3, 3, 3, 3]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ specId: 'verb-conjugation', collected: 6 }),
      expect.objectContaining({ specId: 'noun-declension', collected: 6 }),
    ]);
  });

  it('never picks the same word for two paradigms that both match it', async () => {
    const words = range(3).map(index => verbWithFormCount(`verb-${index}`, 6));
    const spec = (id: string): WordQuerySpec => ({
      id,
      paradigm: 'verb-conjugation',
      partOfSpeech: 'verb',
      filters: {},
      tableType: 'conjugation',
      steps: verbParadigm.steps,
      formSelection: verbParadigm.formSelection,
    });
    const result = await collectGeneratedExerciseWords({
      db: poolDb(words) as never,
      collection: 'vocabulary_words_v5',
      specs: [spec('first'), spec('second')],
      count: 9,
      uniqueWordCount: 3,
      exercise: uniqueWordExercise(),
      poolId: POOL_ID,
      rng: createGeneratedExerciseRng(1),
    });

    expect(result.words).toHaveLength(9);
    expect(result.uniqueWords).toBe(3);
    expect([...countsById(result.words).values()]).toEqual([3, 3, 3]);
    expectEveryFormDistinct(result.words);
  });
});

describe('delivering repeated pool words', () => {
  const words = range(50).map(index => verbWithFormCount(`verb-${index}`, 6));

  it.each([
    ['single-field', false, 30],
    ['step-by-step', false, 60],
    ['step-by-step', true, 60],
  ] as const)(
    'gives every occurrence its own items in %s mode (all primary: %s)',
    async (mode, requireAll, itemCount) => {
      const exercise = uniqueWordExercise({}, { mode, requireAllPrimaryAnswers: requireAll });
      const items = (await resolveGeneratedExerciseItems(
        exercise,
        createFirestoreGeneratedWordLoader(poolDb(words) as never, { rng: createGeneratedExerciseRng(3) })
      )) as ResolvedFormIdentificationItem[];

      expect(items).toHaveLength(itemCount);
      expect(new Set(items.map(item => item.id)).size).toBe(itemCount);
      expect(new Set(items.map(item => item.wordId)).size).toBe(30);

      const answers = Object.fromEntries(
        items.map(item => [item.id, 'acceptedAnswers' in item ? item.acceptedAnswers[0] : item.correctAnswerDisplay])
      );
      expect(
        gradeExercisePercentage({ exercise, resolvedItems: items }, { type: 'generated-form-identification', answers })
      ).toBe(100);
    }
  );
});
