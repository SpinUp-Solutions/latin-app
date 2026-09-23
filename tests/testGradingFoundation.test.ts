import { TEST_ELIGIBLE_EXERCISE_TYPES } from '@/src/lib/content/registry';
import { EXERCISE_ANSWER_SCHEMAS } from '@/src/lib/tests/answer-schemas';
import {
  createFrozenTestDeliveryState,
  gradeFrozenTestDelivery,
  sanitizeTestDeliveryState,
} from '@/src/lib/tests/delivery';
import { resolveGeneratedExerciseItems } from '@/src/lib/tests/generated-exercises';
import {
  gradeClickOnMultipleWords,
  gradeGeneratedFormIdentification,
  gradeMatching,
  gradeOddOneOut,
} from '@/src/lib/tests/grading';
import { estimateFirestoreDocumentBytes } from '@/src/lib/tests/firestore-size';
import { applyValueFilter } from '@/src/lib/tests/generated-word-loader.server';
import { filterOverlappingPronounParadigms, isRejectedBySpecAwarePronounOverlap } from '@/src/utils/generated/pronounParadigmFiltering';
import type {
  FillExercise,
  Exercise,
  GeneratedFormIdentificationExercise,
  MatchingExercise,
  OddOneOutExercise,
  ClickOnMultipleWordsExercise,
  TranslationGradingExercise,
} from '@/src/types/exercises';
import type {
  FormIdentificationItem,
  MultiAnswerFormIdentificationItem,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import type { TestVersion } from '@/src/types/test';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';

jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));

const feedbackConfig = { escalationLevels: [] };

const fillExercise: FillExercise = {
  id: 'fill-one',
  type: 'fill',
  title: 'Fill',
  instructions: '',
  maxPoints: 6,
  feedbackConfig,
  data: {
    items: [
      { text: 'One', answer: 'amo' },
      { text: 'Two', answer: 'amas' },
      { text: 'Three', answer: 'amat' },
    ],
  },
};

const makeVersion = (exercise: Exercise = fillExercise): TestVersion => ({
  id: 'version-one',
  name: 'Version A',
  pages: [{ id: 'page-one', items: [exercise] }],
  totalPages: 1,
  totalItems: 1,
  totalExercises: 1,
  totalPoints: exercise.maxPoints!,
});

describe('test grading foundation', () => {
  it('defines one canonical answer schema for every test-eligible exercise', () => {
    expect(Object.keys(EXERCISE_ANSWER_SCHEMAS).sort()).toEqual([...TEST_ELIGIBLE_EXERCISE_TYPES].sort());
  });

  it('grades a frozen copy with fractional credit and ignores later version edits', async () => {
    const version = makeVersion();
    const state = await createFrozenTestDeliveryState(version, async () => []);
    fillExercise.data.items[0].answer = 'changed-after-start';

    expect(
      gradeFrozenTestDelivery(state, {
        'fill-one': { type: 'fill', answers: ['amo', 'wrong', 'amat'] },
      })
    ).toMatchObject({ awardedPoints: 4, maxPoints: 6 });
  });

  it('rejects invalid max points even when an exercise is unanswered', async () => {
    const invalidExercise = { ...fillExercise, maxPoints: undefined };
    const state = await createFrozenTestDeliveryState(makeVersion(invalidExercise), async () => []);

    expect(() => gradeFrozenTestDelivery(state, {})).toThrow('Exercise fill-one has invalid maxPoints');
  });

  it('normalizes AI translation scores out of ten to the admin-selected points', async () => {
    const exercise: TranslationGradingExercise = {
      id: 'translation-one',
      type: 'translation-grading',
      title: 'Translate',
      instructions: '',
      maxPoints: 8,
      feedbackConfig,
      translationDirection: 'english-to-latin',
      data: {
        items: [{ latinText: '<p>The girl&nbsp;sings.<br>Today.</p><p>Again.</p>' }, { latinText: 'The boys run.' }],
      },
    };
    const state = await createFrozenTestDeliveryState(makeVersion(exercise), async () => []);
    const answers = {
      'translation-one': {
        type: 'translation-grading' as const,
        translations: ['puella cantat', 'pueri currunt'],
      },
    };

    const result = gradeFrozenTestDelivery(state, answers, {
      'translation-one': {
        '0': { translation: 'puella cantat', score: 9, feedback: 'Strong translation.' },
        '1': { translation: 'pueri currunt', score: 6, feedback: 'Check the verb form.' },
      },
    });

    expect(result).toMatchObject({ awardedPoints: 6, maxPoints: 8 });
  });

  it('ignores an empty multi-value filter instead of issuing a Firestore in query with no values', () => {
    const query = { where: jest.fn() } as unknown as Parameters<typeof applyValueFilter>[0];

    expect(applyValueFilter(query, 'declension', ' , ')).toBe(query);
    expect(query.where).not.toHaveBeenCalled();
  });

  it('ignores non-string filter values instead of throwing', () => {
    const query = { where: jest.fn() } as unknown as Parameters<typeof applyValueFilter>[0];

    expect(applyValueFilter(query, 'conjugation', 3 as never)).toBe(query);
    expect(query.where).not.toHaveBeenCalled();
  });

  it('uses a conservative Firestore-aware document size estimate', () => {
    const document = { numericValues: Array.from({ length: 20 }, (_, index) => index) };

    expect(estimateFirestoreDocumentBytes(document)).toBeGreaterThan(Buffer.byteLength(JSON.stringify(document)));
  });

  it('filters first- and second-person personal pronouns only for the broad gendered paradigm', () => {
    const words = [
      { id: 'first', part_of_speech: 'pronoun', pronoun_type: 'personal', person: '1st' },
      { id: 'third', part_of_speech: 'pronoun', pronoun_type: 'personal', person: '3rd' },
      { id: 'relative', part_of_speech: 'pronoun', pronoun_type: 'relative' },
    ];
    const broad = {
      'pronoun-gendered': { enabled: true, steps: ['case'], filters: {} },
    } as Parameters<typeof filterOverlappingPronounParadigms>[1];
    const personalOnly = {
      'pronoun-gendered': { enabled: true, steps: ['case'], filters: { pronounType: 'personal' } },
    } as Parameters<typeof filterOverlappingPronounParadigms>[1];

    expect(filterOverlappingPronounParadigms(words, broad).map(word => word.id)).toEqual(['third', 'relative']);
    expect(filterOverlappingPronounParadigms(words, personalOnly)).toEqual(words);
    expect(
      isRejectedBySpecAwarePronounOverlap(words[0], 'pronoun-personal', broad as Parameters<typeof isRejectedBySpecAwarePronounOverlap>[2])
    ).toBe(false);
    expect(
      isRejectedBySpecAwarePronounOverlap(words[0], 'pronoun-gendered', broad as Parameters<typeof isRejectedBySpecAwarePronounOverlap>[2])
    ).toBe(true);
  });

  it('normalizes single-field morphology credit to the authored max points', () => {
    const exercise = {
      id: 'morphology',
      type: 'generated-form-identification',
      title: 'Morphology',
      instructions: '',
      maxPoints: 6,
      feedbackConfig,
      data: {
        mode: 'single-field',
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
        paradigmConfigs: {},
      },
    } as GeneratedFormIdentificationExercise;
    const item: SingleFieldFormIdentificationItem = {
      id: 'word-one',
      wordId: 'word-one',
      word: 'amamus',
      root_word: 'amo',
      dictionary_entry: 'amo, amare',
      selected_form: 'amamus',
      hasSelectedForm: true,
      steps: ['person', 'number', 'tense'],
      correctAnswerDisplay: 'first,plural,present',
      primaryFormPaths: [{ person: 'first', number: 'plural', tense: 'present' }],
      optionalFormPaths: [],
    };

    expect(
      gradeGeneratedFormIdentification(
        exercise,
        { type: 'generated-form-identification', answers: { 'word-one': 'first,singular,present' } },
        [item]
      )
    ).toEqual({ awardedPoints: 4, maxPoints: 6 });
  });

  it('awards partial credit across step-by-step generated items', () => {
    const exercise = {
      id: 'morphology',
      type: 'generated-form-identification',
      title: 'Morphology',
      instructions: '',
      maxPoints: 4,
      feedbackConfig,
      data: {
        mode: 'step-by-step',
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
        paradigmConfigs: {},
      },
    } as GeneratedFormIdentificationExercise;
    const base = {
      wordId: 'word-one',
      word: 'amamus',
      root_word: 'amo',
      dictionary_entry: null,
      selected_form: 'amamus',
      hasSelectedForm: true,
      hint: undefined,
      primaryFormPaths: [{ person: 'first', number: 'plural' }],
      optionalFormPaths: [],
    };
    const items: FormIdentificationItem[] = [
      { ...base, id: 'person', step: 'person', correctAnswer: 'first', acceptedAnswers: ['first'] },
      { ...base, id: 'number', step: 'number', correctAnswer: 'plural', acceptedAnswers: ['plural'] },
    ];

    expect(
      gradeGeneratedFormIdentification(
        exercise,
        { type: 'generated-form-identification', answers: { person: 'first', number: 'singular' } },
        items
      )
    ).toEqual({ awardedPoints: 2, maxPoints: 4 });
  });

  it('does not combine individually valid morphology fields from incompatible form paths', () => {
    const exercise = {
      id: 'morphology-paths',
      type: 'generated-form-identification',
      title: 'Morphology',
      instructions: '',
      maxPoints: 4,
      feedbackConfig,
      data: {
        mode: 'step-by-step',
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
        paradigmConfigs: {},
      },
    } as GeneratedFormIdentificationExercise;
    const primaryFormPaths = [
      { person: 'first', number: 'singular' },
      { person: 'third', number: 'plural' },
    ];
    const base = {
      wordId: 'word-one',
      word: 'form',
      root_word: 'root',
      dictionary_entry: null,
      selected_form: 'form',
      hasSelectedForm: true,
      hint: undefined,
      primaryFormPaths,
      optionalFormPaths: [],
    };
    const items: FormIdentificationItem[] = [
      {
        ...base,
        id: 'person',
        step: 'person',
        correctAnswer: 'first / third',
        acceptedAnswers: ['first', 'third'],
      },
      {
        ...base,
        id: 'number',
        step: 'number',
        correctAnswer: 'singular / plural',
        acceptedAnswers: ['singular', 'plural'],
      },
    ];

    expect(
      gradeGeneratedFormIdentification(
        exercise,
        { type: 'generated-form-identification', answers: { person: 'first', number: 'plural' } },
        items
      )
    ).toEqual({ awardedPoints: 2, maxPoints: 4 });
  });

  it('preserves matching misses and authored repetitions in the canonical answer', () => {
    const exercise: MatchingExercise = {
      id: 'matching',
      type: 'matching',
      title: 'Matching',
      instructions: '',
      maxPoints: 6,
      feedbackConfig,
      data: {
        leftColumn: [
          { id: 'left-a', value: 'A' },
          { id: 'left-b', value: 'B' },
        ],
        rightColumn: [
          { id: 'right-a', value: 'One' },
          { id: 'right-b', value: 'Two' },
        ],
        answers: { 'left-a': 'right-a', 'left-b': 'right-b' },
        requiredRepetitions: 2,
      },
    };

    expect(
      gradeMatching(exercise, {
        type: 'matching',
        rounds: [
          { 'left-a': 'right-b', 'left-b': 'right-b' },
          { 'left-a': 'right-a', 'left-b': 'right-b' },
        ],
      })
    ).toEqual({ awardedPoints: 4.5, maxPoints: 6 });
  });

  it('does not credit a matching item with a duplicate display value but the wrong ID', () => {
    const exercise: MatchingExercise = {
      id: 'matching-duplicates',
      type: 'matching',
      title: 'Matching',
      instructions: '',
      maxPoints: 2,
      feedbackConfig,
      data: {
        leftColumn: [{ id: 'left-a', value: 'A' }],
        rightColumn: [
          { id: 'right-a', value: 'Same label' },
          { id: 'right-b', value: 'Same label' },
        ],
        answers: { 'left-a': 'right-a' },
      },
    };

    expect(
      gradeMatching(exercise, {
        type: 'matching',
        rounds: [{ 'left-a': 'right-b' }],
      })
    ).toEqual({ awardedPoints: 0, maxPoints: 2 });
  });

  it('ignores orphaned matching answer keys in the score denominator', () => {
    const exercise: MatchingExercise = {
      id: 'matching-orphaned-answer',
      type: 'matching',
      title: 'Matching',
      instructions: '',
      maxPoints: 2,
      feedbackConfig,
      data: {
        leftColumn: [{ id: 'left-a', value: 'A' }],
        rightColumn: [{ id: 'right-a', value: 'One' }],
        answers: {
          'left-orphaned': 'right-a',
          'left-a': 'right-a',
        },
      },
    };

    expect(
      gradeMatching(exercise, {
        type: 'matching',
        rounds: [{ 'left-a': 'right-a' }],
      })
    ).toEqual({ awardedPoints: 2, maxPoints: 2 });
  });

  it('rejects fractional matching repetitions before they can award more than maxPoints', () => {
    const exercise: MatchingExercise = {
      id: 'matching-fractional-rounds',
      type: 'matching',
      title: 'Matching',
      instructions: '',
      maxPoints: 2,
      feedbackConfig,
      data: {
        leftColumn: [{ id: 'left-a', value: 'A' }],
        rightColumn: [{ id: 'right-a', value: 'One' }],
        answers: { 'left-a': 'right-a' },
        requiredRepetitions: 1.5,
      },
    };

    expect(() =>
      gradeMatching(exercise, {
        type: 'matching',
        rounds: [{ 'left-a': 'right-a' }, { 'left-a': 'right-a' }],
      })
    ).toThrow('invalid requiredRepetitions');
  });

  it('fails strict click-selection scoring when any extra word is selected', () => {
    const exercise: ClickOnMultipleWordsExercise = {
      id: 'strict-click',
      type: 'click-on-multiple-words',
      title: 'Click',
      instructions: '',
      maxPoints: 3,
      feedbackConfig,
      data: {
        passage: 'amo amas amat',
        correctWordIndices: [0, 1],
        allowOverSelection: false,
      },
    };

    expect(
      gradeClickOnMultipleWords(exercise, {
        type: 'click-on-multiple-words',
        selectedWordIndices: [0, 1, 2],
      })
    ).toEqual({ awardedPoints: 0, maxPoints: 3 });

    expect(
      gradeClickOnMultipleWords(exercise, {
        type: 'click-on-multiple-words',
        selectedWordIndices: [0],
      })
    ).toEqual({ awardedPoints: 1.5, maxPoints: 3 });
  });

  it('requires a nonblank explanation only when odd-one-out config requires one', () => {
    const exercise: OddOneOutExercise = {
      id: 'odd-one',
      type: 'odd-one-out',
      title: 'Odd one out',
      instructions: '',
      maxPoints: 2,
      feedbackConfig,
      data: {
        question: 'Which one differs?',
        items: [
          { id: 'regular', text: 'Regular', isOddOneOut: false },
          { id: 'odd', text: 'Odd', isOddOneOut: true },
        ],
        requireExplanation: true,
      },
    };
    const blankAnswer = {
      type: 'odd-one-out' as const,
      selectedItemId: 'odd',
      explanation: '<p><br>&nbsp;\u200B</p>',
    };

    expect(gradeOddOneOut(exercise, blankAnswer)).toEqual({ awardedPoints: 0, maxPoints: 2 });
    expect(gradeOddOneOut(exercise, { ...blankAnswer, explanation: '<p>It has a different ending.</p>' })).toEqual({
      awardedPoints: 2,
      maxPoints: 2,
    });
    expect(gradeOddOneOut({ ...exercise, data: { ...exercise.data, requireExplanation: false } }, blankAnswer)).toEqual(
      { awardedPoints: 2, maxPoints: 2 }
    );
  });

  it('does not throw when a multi-answer morphology response skips an intermediate step', () => {
    const exercise = {
      id: 'multi-morphology',
      type: 'generated-form-identification',
      title: 'Morphology',
      instructions: '',
      maxPoints: 3,
      feedbackConfig,
      data: {
        mode: 'step-by-step',
        requireAllPrimaryAnswers: true,
        generatorConfig: { collection: 'words', wordSource: 'filters', count: 1 },
        paradigmConfigs: {},
      },
    } as GeneratedFormIdentificationExercise;
    const primaryFormPaths = [{ person: 'first', number: 'plural', tense: 'present' }];
    const base = {
      wordId: 'word-one',
      word: 'amamus',
      root_word: 'amo',
      dictionary_entry: null,
      selected_form: 'amamus',
      hasSelectedForm: true,
      steps: ['person', 'number', 'tense'] as MultiAnswerFormIdentificationItem['steps'],
      totalSteps: 3,
      primaryFormPaths,
      optionalFormPaths: [],
      expectedAnswerCount: 1,
    };
    const items: MultiAnswerFormIdentificationItem[] = [
      { ...base, id: 'person', step: 'person', stepIndex: 0, correctAnswerDisplay: 'first' },
      { ...base, id: 'number', step: 'number', stepIndex: 1, correctAnswerDisplay: 'plural' },
      { ...base, id: 'tense', step: 'tense', stepIndex: 2, correctAnswerDisplay: 'present' },
    ];

    expect(
      gradeGeneratedFormIdentification(
        exercise,
        {
          type: 'generated-form-identification',
          answers: { person: 'first', number: 'singular', tense: 'present' },
        },
        items
      )
    ).toEqual({ awardedPoints: 1, maxPoints: 3 });
  });

  it('assigns unique answer identities when the word loader returns duplicate documents', async () => {
    const exercise = {
      id: 'duplicate-morphology',
      type: 'generated-form-identification',
      title: 'Morphology',
      instructions: '',
      maxPoints: 2,
      feedbackConfig,
      data: {
        mode: 'single-field',
        generatorConfig: { collection: 'words', wordSource: 'pool', poolId: 'pool', count: 2 },
        paradigmConfigs: {
          'noun-declension': { enabled: true, steps: ['case'], filters: {} },
        },
      },
    } as GeneratedFormIdentificationExercise;
    const word = {
      id: 'same-word',
      root_word: 'rosa',
      dictionary_entry: 'rosa, rosae',
      selected_form: 'rosa',
      part_of_speech: 'noun',
      form_path: { case: 'nominative', number: 'singular' },
      primary_form_paths: [{ case: 'nominative', number: 'singular' }],
      optional_form_paths: [],
    } as ExerciseWordResponse;

    const items = await resolveGeneratedExerciseItems(exercise, async () => [word, { ...word }]);
    expect(items.map(item => ('id' in item ? item.id : null))).toEqual(['same-word', 'same-word::2']);
  });

  it('removes static and generated grading inputs from the student projection', async () => {
    const state = await createFrozenTestDeliveryState(makeVersion(), async () => []);
    state.resolvedExercises.generated = {
      items: [{ text: 'amo', acceptedAnswers: ['love'], hint: 'secret hint' }],
    };

    const serialized = JSON.stringify(sanitizeTestDeliveryState(state));
    expect(serialized).not.toContain('"answer"');
    expect(serialized).not.toContain('acceptedAnswers');
    expect(serialized).not.toContain('secret hint');
    expect(serialized).not.toContain('feedbackConfig');
  });

  it('freezes the version vocabulary pool into student-safe attempt delivery', async () => {
    const version = {
      ...makeVersion(),
      vocabularyPoolId: 'pool-one',
      pages: [
        {
          id: 'page-one',
          items: [fillExercise, { id: 'pool-content', type: 'vocabulary-pool' as const }],
        },
      ],
    };
    const loadVocabularyPool = jest.fn(async () => ({
      id: 'pool-one',
      name: 'Chapter words',
      items: [
        {
          id: 'amo',
          latin: 'amō',
          english: 'I love',
          partOfSpeech: 'verb',
          notes: 'First conjugation',
          futurePrivate: 'secret-pool-field',
        },
      ],
    }));

    const state = await createFrozenTestDeliveryState(version, async () => [], loadVocabularyPool as never);
    const delivery = sanitizeTestDeliveryState(state);

    expect(loadVocabularyPool).toHaveBeenCalledWith('pool-one');
    expect(delivery.vocabularyPool).toEqual({
      id: 'pool-one',
      name: 'Chapter words',
      items: [
        {
          id: 'amo',
          latin: 'amō',
          english: 'I love',
          pronunciation: undefined,
          audioPath: undefined,
          example: undefined,
          partOfSpeech: 'verb',
          notes: 'First conjugation',
        },
      ],
    });
    expect(JSON.stringify(delivery)).not.toContain('secret-pool-field');
  });
});
