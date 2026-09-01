jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));

import { createFakeGeneratedWordDb, type FakeDocument } from './helpers/fakeGeneratedWordFirestore';
import {
  allocateFairShares,
  collectGeneratedExerciseWords,
  createGeneratedExerciseRng,
  PER_SPEC_SCAN_FLOOR,
  perSpecScanCeiling,
} from '@/src/lib/tests/generated-word-composition.server';
import { createFirestoreGeneratedWordLoader } from '@/src/lib/tests/generated-word-loader.server';
import {
  isUsableGeneratedTranslationWord,
  resolveGeneratedExerciseItems,
} from '@/src/lib/tests/generated-exercises';
import type { GeneratedFormIdentificationExercise, GeneratedTranslationExercise } from '@/src/types/exercises';
import { isRejectedBySpecAwarePronounOverlap } from '@/src/utils/generated/pronounParadigmFiltering';

const translationExercise = (
  pos: string[],
  count: number | 'all',
  extras: Partial<GeneratedTranslationExercise['data']['generatorConfig']> = {}
): GeneratedTranslationExercise =>
  ({
    type: 'generated-translation',
    translationDirection: 'latin-to-english',
    data: {
      generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count, ...extras },
      posConfigs: Object.fromEntries(pos.map(partOfSpeech => [partOfSpeech, { enabled: true, filters: {} }])),
    },
  }) as GeneratedTranslationExercise;

const morphologyExercise = (
  paradigms: GeneratedFormIdentificationExercise['data']['paradigmConfigs'],
  count: number | 'all' = 10
): GeneratedFormIdentificationExercise =>
  ({
    type: 'generated-form-identification',
    data: {
      mode: 'step-by-step',
      generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count },
      paradigmConfigs: paradigms,
    },
  }) as GeneratedFormIdentificationExercise;

const nounDoc = (id: string, extras: Record<string, unknown> = {}): FakeDocument => ({
  id,
  data: {
    word: id,
    part_of_speech: 'noun',
    translation: 'girl',
    random_index: 0.5,
    sort_key: id,
    declension_table: { singular: { nominative: [id] } },
    ...extras,
  },
});

const verbDoc = (id: string, extras: Record<string, unknown> = {}): FakeDocument => ({
  id,
  data: {
    word: id,
    part_of_speech: 'verb',
    translation: 'love',
    random_index: 0.5,
    sort_key: id,
    conjugation_table: {
      indicative: { active: { present: { singular: { first: [id] } } } },
    },
    ...extras,
  },
});

describe('generated exercise word replenishment', () => {
  it('returns exactly count usable words from a mixed fixture', async () => {
    const words = [
      ...Array.from({ length: 8 }, (_, index) => nounDoc(`noun-${index}`)),
      ...Array.from({ length: 8 }, (_, index) => verbDoc(`verb-${index}`)),
    ];
    const db = createFakeGeneratedWordDb({ words });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        { id: 'noun', partOfSpeech: 'noun', filters: {} },
        { id: 'verb', partOfSpeech: 'verb', filters: {} },
      ],
      count: 10,
      exercise: translationExercise(['noun', 'verb'], 10),
      rng: createGeneratedExerciseRng(1),
    });

    expect(result.words).toHaveLength(10);
  });

  it('continues scanning after ineligible candidates instead of stopping at fetch-N-then-filter', async () => {
    const words = [
      ...Array.from({ length: 5 }, (_, index) => nounDoc(`aaa-reject-${index}`, { declension_table: {} })),
      ...Array.from({ length: 12 }, (_, index) => nounDoc(`noun-${index}`)),
    ];
    const db = createFakeGeneratedWordDb({ words });
    const formSelection = { tableType: 'declension' as const, selectedCellPaths: ['singular.nominative'] };
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        {
          id: 'noun-declension',
          paradigm: 'noun-declension',
          partOfSpeech: 'noun',
          filters: {},
          tableType: 'declension',
          steps: ['case'],
          formSelection,
        },
      ],
      count: 10,
      exercise: morphologyExercise(
        {
          'noun-declension': {
            enabled: true,
            filters: {},
            steps: ['case'],
            formSelection,
          },
        },
        10
      ),
      rng: createGeneratedExerciseRng(1),
    });

    expect(result.words).toHaveLength(10);
    expect(result.words.every(word => word.id.startsWith('noun-'))).toBe(true);
    expect(result.diagnostics[0].scanned).toBeGreaterThan(10);
  });

  it('filters placeholder forms and replenishes words with no usable selected forms', async () => {
    const selectedPath = 'indicative.active.present.singular.first';
    const formSelection = { tableType: 'conjugation' as const, selectedCellPaths: [selectedPath] };
    const conjugationTable = (forms: string[]) => ({
      indicative: { active: { present: { singular: { first: forms } } } },
    });
    const db = createFakeGeneratedWordDb({
      words: [
        verbDoc('aaa-dash-only', { conjugation_table: conjugationTable(['—']) }),
        verbDoc('aab-blank-only', { conjugation_table: conjugationTable(['   ']) }),
        verbDoc('real-form', { conjugation_table: conjugationTable(['—', 'amat', '']) }),
      ],
    });
    const exercise = morphologyExercise(
      {
        'verb-conjugation': {
          enabled: true,
          filters: {},
          steps: ['person'],
          formSelection,
        },
      },
      1
    );
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        {
          id: 'verb-conjugation',
          paradigm: 'verb-conjugation',
          partOfSpeech: 'verb',
          filters: {},
          tableType: 'conjugation',
          steps: ['person'],
          formSelection,
        },
      ],
      count: 1,
      exercise,
      rng: createGeneratedExerciseRng(101),
    });

    expect(result.words).toHaveLength(1);
    expect(result.words[0]).toMatchObject({ id: 'real-form', selected_form: 'amat' });
    expect(result.diagnostics[0].scanned).toBeGreaterThan(1);
  });

  it('returns all eligible words when the source is smaller than count', async () => {
    const db = createFakeGeneratedWordDb({
      words: [nounDoc('n1'), nounDoc('n2'), verbDoc('v1')],
    });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        { id: 'noun', partOfSpeech: 'noun', filters: {} },
        { id: 'verb', partOfSpeech: 'verb', filters: {} },
      ],
      count: 10,
      exercise: translationExercise(['noun', 'verb'], 10),
      rng: createGeneratedExerciseRng(2),
    });

    expect(result.words).toHaveLength(3);
    expect(result.diagnostics.every(entry => entry.exhausted)).toBe(true);
  });

  it('borrows from a rich spec when a sparse spec cannot fill its share', async () => {
    const db = createFakeGeneratedWordDb({
      words: [nounDoc('n1'), ...Array.from({ length: 12 }, (_, index) => verbDoc(`verb-${index}`))],
    });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        { id: 'noun', partOfSpeech: 'noun', filters: {} },
        { id: 'verb', partOfSpeech: 'verb', filters: {} },
      ],
      count: 10,
      exercise: translationExercise(['noun', 'verb'], 10),
      rng: createGeneratedExerciseRng(3),
    });

    expect(result.words).toHaveLength(10);
    const byPos = result.words.reduce<Record<string, number>>((counts, word) => {
      const pos = String(word.part_of_speech);
      counts[pos] = (counts[pos] ?? 0) + 1;
      return counts;
    }, {});
    expect(byPos.noun).toBe(1);
    expect(byPos.verb).toBe(9);
  });

  it('honors fair shares for two healthy paradigms', async () => {
    const db = createFakeGeneratedWordDb({
      words: [
        ...Array.from({ length: 12 }, (_, index) => nounDoc(`noun-${index}`)),
        ...Array.from({ length: 12 }, (_, index) => verbDoc(`verb-${index}`)),
      ],
    });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        { id: 'noun', partOfSpeech: 'noun', filters: {} },
        { id: 'verb', partOfSpeech: 'verb', filters: {} },
      ],
      count: 10,
      exercise: translationExercise(['noun', 'verb'], 10),
      rng: createGeneratedExerciseRng(4),
    });

    const byPos = result.words.reduce<Record<string, number>>((counts, word) => {
      const pos = String(word.part_of_speech);
      counts[pos] = (counts[pos] ?? 0) + 1;
      return counts;
    }, {});
    expect(byPos.noun).toBe(5);
    expect(byPos.verb).toBe(5);
  });

  it('assigns remainders deterministically from a seeded rng', () => {
    const rng = createGeneratedExerciseRng(42);
    expect(allocateFairShares(5, 2, rng)).toEqual(allocateFairShares(5, 2, createGeneratedExerciseRng(42)));
    expect(allocateFairShares(5, 2, createGeneratedExerciseRng(42)).reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(allocateFairShares(5, 2, createGeneratedExerciseRng(42)).filter(value => value > 0)).toHaveLength(2);
  });

  it('keeps count: all matching semantics', async () => {
    const db = createFakeGeneratedWordDb({
      words: [nounDoc('n1'), nounDoc('n2'), verbDoc('v1')],
    });
    const words = await createFirestoreGeneratedWordLoader(db as never, { rng: createGeneratedExerciseRng(5) })(
      translationExercise(['noun', 'verb'], 'all')
    );
    expect(words).toHaveLength(3);
  });

  it('stops at the per-spec scan ceiling and flags scanLimitReached', async () => {
    const db = createFakeGeneratedWordDb({
      words: Array.from({ length: 500 }, (_, index) => nounDoc(`noun-${index}`, { translation: '' })),
    });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [{ id: 'noun', partOfSpeech: 'noun', filters: {} }],
      count: 10,
      exercise: translationExercise(['noun'], 10),
      rng: createGeneratedExerciseRng(6),
    });

    expect(result.words).toHaveLength(0);
    expect(result.diagnostics[0]?.scanLimitReached).toBe(true);
    expect(result.diagnostics[0]?.scanned).toBeLessThanOrEqual(Math.max(PER_SPEC_SCAN_FLOOR, 400));
  });

  it('does not let many sparse paradigms exceed the global scan budget', async () => {
    const parts = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'interjection', 'pronoun'];
    const words = parts.flatMap(partOfSpeech =>
      Array.from({ length: 400 }, (_, index) => ({
        id: `${partOfSpeech}-${index}`,
        data: {
          word: `${partOfSpeech}-${index}`,
          part_of_speech: partOfSpeech,
          random_index: 0.5,
          sort_key: `${partOfSpeech}-${index}`,
        },
      }))
    );
    const db = createFakeGeneratedWordDb({ words });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: parts.map(partOfSpeech => ({ id: partOfSpeech, partOfSpeech, filters: {} })),
      count: 10,
      exercise: translationExercise(parts, 10),
      rng: createGeneratedExerciseRng(7),
    });

    const scanned = result.diagnostics.reduce((sum, entry) => sum + entry.scanned, 0);
    expect(scanned).toBeLessThanOrEqual(2000);
    expect(result.globalScanLimitReached).toBe(true);
  });

  it('uses a first batch equal to the remaining share for a dense small-count query', async () => {
    const limitCalls: number[] = [];
    const db = createFakeGeneratedWordDb({
      words: Array.from({ length: 20 }, (_, index) => nounDoc(`noun-${index}`)),
      limitCalls,
    });
    await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [{ id: 'noun', partOfSpeech: 'noun', filters: {} }],
      count: 10,
      exercise: translationExercise(['noun'], 10),
      rng: createGeneratedExerciseRng(8),
    });

    expect(limitCalls[0]).toBe(10);
  });

  it('does not skip documents that share a sort_key across a search page boundary', async () => {
    const words = Array.from({ length: 6 }, (_, index) =>
      nounDoc(`puella-${index}`, { sort_key: 'puella', random_index: index / 10 })
    );
    const db = createFakeGeneratedWordDb({ words });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [{ id: 'noun', partOfSpeech: 'noun', filters: { search: 'puella' } }],
      count: 6,
      exercise: translationExercise(['noun'], 6),
      rng: createGeneratedExerciseRng(9),
    });

    expect(result.words).toHaveLength(6);
  });

  it('does not skip documents that share random_index across the wrap boundary', async () => {
    const words = Array.from({ length: 8 }, (_, index) => nounDoc(`noun-${index}`, { random_index: 0.5 }));
    const db = createFakeGeneratedWordDb({ words });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [{ id: 'noun', partOfSpeech: 'noun', filters: {} }],
      count: 8,
      exercise: translationExercise(['noun'], 8),
      rng: createGeneratedExerciseRng(10),
    });

    expect(result.words).toHaveLength(8);
  });

  it('allows the same word id from two specs', async () => {
    const shared = nounDoc('shared', { part_of_speech: 'noun', translation: 'girl' });
    const db = createFakeGeneratedWordDb({ words: [shared] });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        { id: 'one', partOfSpeech: 'noun', filters: {} },
        { id: 'two', partOfSpeech: 'noun', filters: {} },
      ],
      count: 2,
      exercise: translationExercise(['noun'], 2),
      rng: createGeneratedExerciseRng(11),
    });

    expect(result.words.map(word => word.id)).toEqual(['shared', 'shared']);
  });

  it('skips morphology words that map but cannot be prepared', async () => {
    const db = createFakeGeneratedWordDb({
      words: [
        verbDoc('amo'),
        nounDoc('puella'),
        verbDoc('laudo'),
      ],
    });
    const exercise = morphologyExercise(
      {
        'verb-conjugation': {
          enabled: true,
          filters: {},
          steps: ['gender'],
          formSelection: {
            tableType: 'conjugation',
            selectedCellPaths: ['indicative.active.present.singular.first'],
          },
        },
      },
      10
    );
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        {
          id: 'verb-conjugation',
          paradigm: 'verb-conjugation',
          partOfSpeech: 'verb',
          filters: {},
          tableType: 'conjugation',
          formSelection: {
            tableType: 'conjugation',
            selectedCellPaths: ['indicative.active.present.singular.first'],
          },
        },
      ],
      count: 10,
      exercise,
      rng: createGeneratedExerciseRng(12),
    });

    expect(result.words).toHaveLength(0);
  });

  it('keeps personal-paradigm pronouns when a broad gendered spec is also enabled', async () => {
    const ego: FakeDocument = {
      id: 'ego',
      data: {
        word: 'ego',
        part_of_speech: 'pronoun',
        pronoun_type: 'personal',
        person: '1st',
        translation: 'I',
        random_index: 0.2,
        sort_key: 'ego',
        declension_table: { singular: { nominative: ['ego'] } },
      },
    };
    const is: FakeDocument = {
      id: 'is',
      data: {
        word: 'is',
        part_of_speech: 'pronoun',
        pronoun_type: 'personal',
        person: '3rd',
        translation: 'he',
        random_index: 0.3,
        sort_key: 'is',
        declension_table: { masculine: { singular: { nominative: ['is'] } } },
      },
    };
    expect(
      isRejectedBySpecAwarePronounOverlap(
        ego.data,
        'pronoun-gendered',
        {
          'pronoun-gendered': { enabled: true, steps: ['case'], filters: {} },
          'pronoun-personal': { enabled: true, steps: ['case'], filters: {} },
        }
      )
    ).toBe(true);
    expect(
      isRejectedBySpecAwarePronounOverlap(ego.data, 'pronoun-personal', {
        'pronoun-gendered': { enabled: true, steps: ['case'], filters: {} },
        'pronoun-personal': { enabled: true, steps: ['case'], filters: {} },
      })
    ).toBe(false);

    const db = createFakeGeneratedWordDb({ words: [ego, is] });
    const exercise = morphologyExercise(
      {
        'pronoun-personal': {
          enabled: true,
          filters: {},
          steps: ['case', 'number'],
          formSelection: { tableType: 'pronoun-declension', selectedCellPaths: ['singular.nominative'] },
        },
        'pronoun-gendered': {
          enabled: true,
          filters: {},
          steps: ['case', 'number'],
          formSelection: {
            tableType: 'pronoun-adjective-declension',
            selectedCellPaths: ['masculine.singular.nominative'],
          },
        },
      },
      2
    );
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        {
          id: 'pronoun-personal',
          paradigm: 'pronoun-personal',
          partOfSpeech: 'pronoun',
          filters: { pronounType: 'personal', pronounPerson: '1st,2nd' },
          tableType: 'pronoun-declension',
          steps: ['case', 'number'],
          formSelection: { tableType: 'pronoun-declension', selectedCellPaths: ['singular.nominative'] },
        },
        {
          id: 'pronoun-gendered',
          paradigm: 'pronoun-gendered',
          partOfSpeech: 'pronoun',
          filters: {},
          tableType: 'pronoun-adjective-declension',
          steps: ['case', 'number'],
          formSelection: {
            tableType: 'pronoun-adjective-declension',
            selectedCellPaths: ['masculine.singular.nominative'],
          },
        },
      ],
      count: 2,
      exercise,
      rng: createGeneratedExerciseRng(13),
    });

    expect(result.words.some(word => word.id === 'ego')).toBe(true);
  });

  it('drops translation candidates missing a translation or root word', async () => {
    const db = createFakeGeneratedWordDb({
      words: [
        nounDoc('missing-translation', { translation: '' }),
        nounDoc('missing-root', { word: '', translation: 'girl' }),
        nounDoc('ok'),
      ],
    });
    const latin = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [{ id: 'noun', partOfSpeech: 'noun', filters: {} }],
      count: 10,
      exercise: translationExercise(['noun'], 10),
      rng: createGeneratedExerciseRng(14),
    });
    expect(latin.words.map(word => word.id)).toEqual(['ok']);

    const englishToLatin = {
      ...translationExercise(['noun'], 10),
      translationDirection: 'english-to-latin' as const,
    };
    const reverse = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [{ id: 'noun', partOfSpeech: 'noun', filters: {} }],
      count: 10,
      exercise: englishToLatin,
      rng: createGeneratedExerciseRng(15),
    });
    expect(reverse.words.map(word => word.id)).toEqual(['ok']);
  });

  it('rejects latin-to-english words whose display form is blank', () => {
    const exercise = translationExercise(['noun'], 1);
    expect(
      isUsableGeneratedTranslationWord(exercise, {
        id: 'blank',
        root_word: '',
        dictionary_entry: null,
        selected_form: '',
        part_of_speech: 'noun',
        form_path: null,
        translation: 'girl',
      })
    ).toBe(false);
    expect(
      isUsableGeneratedTranslationWord(exercise, {
        id: 'ok',
        root_word: 'puella',
        dictionary_entry: 'puella',
        selected_form: 'puella',
        part_of_speech: 'noun',
        form_path: null,
        translation: 'girl',
      })
    ).toBe(true);
  });

  it('resolves exactly N frozen words and more than N step-by-step items', async () => {
    const db = createFakeGeneratedWordDb({
      words: Array.from({ length: 12 }, (_, index) =>
        nounDoc(`noun-${index}`, {
          declension_table: { singular: { nominative: [`noun-${index}`] } },
        })
      ),
    });
    const exercise = morphologyExercise(
      {
        'noun-declension': {
          enabled: true,
          filters: {},
          steps: ['case', 'number'],
          formSelection: { tableType: 'declension', selectedCellPaths: ['singular.nominative'] },
        },
      },
      4
    );
    const items = await resolveGeneratedExerciseItems(
      exercise,
      createFirestoreGeneratedWordLoader(db as never, { rng: createGeneratedExerciseRng(16) })
    );
    const wordIds = new Set(items.map(item => ('wordId' in item ? item.wordId : item.text)));
    expect(wordIds.size).toBe(4);
    expect(items.length).toBeGreaterThan(4);
  });

  it('caps pool sampling to a shared universe and consumes missing ids without extending it', async () => {
    const ids = [...Array.from({ length: 8 }, (_, index) => `noun-${index}`), 'missing-id'];
    const db = createFakeGeneratedWordDb({
      words: Array.from({ length: 8 }, (_, index) => nounDoc(`noun-${index}`)),
      pools: [{ id: 'pool-1', wordDocIds: ids }],
    });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        { id: 'noun', partOfSpeech: 'noun', filters: {} },
        { id: 'verb', partOfSpeech: 'verb', filters: {} },
        { id: 'adjective', partOfSpeech: 'adjective', filters: {} },
      ],
      count: 20,
      exercise: {
        ...translationExercise(['noun', 'verb', 'adjective'], 20, {
          wordSource: 'pool',
          poolId: 'pool-1',
          poolWordLimit: 5,
        }),
      },
      poolId: 'pool-1',
      poolWordLimit: 5,
      rng: createGeneratedExerciseRng(17),
    });

    expect(result.words.length).toBeLessThanOrEqual(5);
    expect(new Set(result.words.map(word => word.id)).size).toBeLessThanOrEqual(5);
  });

  it('keeps the unused portion of a pool chunk available for cross-spec borrowing', async () => {
    const words = Array.from({ length: 10 }, (_, index) => nounDoc(`noun-${index}`));
    const db = createFakeGeneratedWordDb({
      words,
      pools: [{ id: 'noun-pool', wordDocIds: words.map(word => word.id) }],
    });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        { id: 'noun', partOfSpeech: 'noun', filters: {} },
        { id: 'verb', partOfSpeech: 'verb', filters: {} },
      ],
      count: 10,
      exercise: translationExercise(['noun', 'verb'], 10, {
        wordSource: 'pool',
        poolId: 'noun-pool',
      }),
      poolId: 'noun-pool',
      rng: createGeneratedExerciseRng(18),
    });

    expect(result.words).toHaveLength(10);
    expect(result.words.every(word => word.part_of_speech === 'noun')).toBe(true);
    expect(result.diagnostics.find(entry => entry.specId === 'noun')?.collected).toBe(10);
  });

  it('charges non-matching pool documents against the global scan budget', async () => {
    const words = Array.from({ length: 2100 }, (_, index) => verbDoc(`verb-${index}`));
    const db = createFakeGeneratedWordDb({
      words,
      pools: [{ id: 'verb-pool', wordDocIds: words.map(word => word.id) }],
    });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [{ id: 'noun', partOfSpeech: 'noun', filters: {} }],
      count: 100,
      exercise: translationExercise(['noun'], 100, {
        wordSource: 'pool',
        poolId: 'verb-pool',
      }),
      poolId: 'verb-pool',
      rng: createGeneratedExerciseRng(19),
    });

    expect(result.words).toHaveLength(0);
    expect(result.diagnostics[0]?.scanned).toBe(2000);
    expect(result.diagnostics[0]?.scanLimitReached).toBe(false);
    expect(result.globalScanLimitReached).toBe(true);
  });

  it('stops a sparse pool POS scan at the per-spec ceiling instead of walking the whole ID list', async () => {
    const nouns = Array.from({ length: 600 }, (_, index) => nounDoc(`noun-${index}`));
    const verbs = Array.from({ length: 4 }, (_, index) => verbDoc(`verb-${index}`));
    const words = [...nouns, ...verbs];
    const ids = words.map(word => word.id);
    const db = createFakeGeneratedWordDb({
      words,
      pools: [{ id: 'mixed-pool', wordDocIds: ids }],
    });
    const result = await collectGeneratedExerciseWords({
      db: db as never,
      collection: 'vocabulary_words_v5',
      specs: [
        { id: 'noun', partOfSpeech: 'noun', filters: {} },
        { id: 'verb', partOfSpeech: 'verb', filters: {} },
      ],
      count: 10,
      exercise: {
        ...translationExercise(['noun', 'verb'], 10, {
          wordSource: 'pool',
          poolId: 'mixed-pool',
        }),
      },
      poolId: 'mixed-pool',
      rng: createGeneratedExerciseRng(18),
    });

    const verbShare = 5;
    const verb = result.diagnostics.find(entry => entry.specId === 'verb');
    expect(verb).toBeDefined();
    expect(perSpecScanCeiling(verbShare)).toBe(PER_SPEC_SCAN_FLOOR);
    expect(verb?.scanned).toBeLessThanOrEqual(perSpecScanCeiling(verbShare));
    expect(verb?.scanned).toBeLessThan(ids.length);
    expect(verb?.scanLimitReached).toBe(true);
    expect(result.words.length).toBeLessThanOrEqual(10);
  });

  it('replays the same seeded rng to the same word set', async () => {
    const db = createFakeGeneratedWordDb({
      words: [
        ...Array.from({ length: 8 }, (_, index) => nounDoc(`noun-${index}`, { random_index: index / 10 })),
        ...Array.from({ length: 8 }, (_, index) => verbDoc(`verb-${index}`, { random_index: index / 10 })),
      ],
    });
    const collect = () =>
      collectGeneratedExerciseWords({
        db: db as never,
        collection: 'vocabulary_words_v5',
        specs: [
          { id: 'noun', partOfSpeech: 'noun', filters: {} },
          { id: 'verb', partOfSpeech: 'verb', filters: {} },
        ],
        count: 10,
        exercise: translationExercise(['noun', 'verb'], 10),
        rng: createGeneratedExerciseRng(99),
      });

    const first = await collect();
    const second = await collect();
    expect(first.words.map(word => word.id)).toEqual(second.words.map(word => word.id));
  });
});
