import { buildSubmittedReview, testResultReviewDocumentSchema, toStudentTestResultReview } from '@/src/lib/tests/review';
import type { Exercise } from '@/src/types/exercises';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { TestResultReviewExerciseItem } from '@/src/types/test-results';

const baseExercise = (type: string, data: unknown, overrides: Record<string, unknown> = {}): Exercise =>
  ({
    id: `ex-${type}`,
    type,
    title: 'Review exercise',
    instructions: 'Follow the instructions',
    maxPoints: 10,
    feedbackConfig: { escalationLevels: [] },
    data,
    ...overrides,
  }) as unknown as Exercise;

const matchingExercise = () =>
  baseExercise('matching', {
    leftColumn: [
      { id: 'left-1', value: 'amo' },
      { id: 'left-2', value: 'ambulo' },
    ],
    rightColumn: [
      { id: 'right-1', value: 'love' },
      { id: 'right-2', value: 'walk' },
    ],
    answers: { 'left-1': 'right-1', 'left-2': 'right-2' },
    requiredRepetitions: 1,
  });

const fillExercise = () =>
  baseExercise('fill', {
    items: [
      { text: 'amo', answer: 'love', explanation: 'First person singular' },
      { text: 'ambulo', answer: 'walk' },
    ],
  });

const multipleChoiceExercise = () =>
  baseExercise('multiple-choice', {
    question: 'What does amo mean?',
    options: [
      { id: 'opt-1', text: 'love', isCorrect: true },
      { id: 'opt-2', text: 'hate', isCorrect: false },
    ],
    allowMultipleSelections: false,
    explanation: 'amo means love',
  });

const oddOneOutExercise = () =>
  baseExercise('odd-one-out', {
    question: 'Which word is not a verb of motion?',
    items: [
      { id: 'odd-1', text: 'amo', isOddOneOut: true },
      { id: 'odd-2', text: 'curro', isOddOneOut: false },
    ],
    explanation: 'amo is not motion',
  });

const textSelectionExercise = () =>
  baseExercise('text-selection', {
    passage: 'amo et ambulo',
    questions: [{ id: 'q-1', text: 'Which word means walk?', correctWordIndex: 2, explanation: 'ambulo' }],
  });

const fillEmboldedTextExercise = () =>
  baseExercise('fill-embolded-text', {
    passage: 'amo means <b>love</b>',
    words: [{ wordIndex: 2, correctAnswer: 'love', question: 'What does amo mean?', explanation: 'love' }],
  });

const sentenceDiagrammingExercise = () =>
  baseExercise('sentence-diagramming', {
    latin: 'amo',
    translation: 'I love',
    tokens: [{ id: 'token-1', text: 'amo', index: 0 }],
    solutionAnnotations: [],
    availableStudentTools: ['verb'],
    difficulty: 'beginner',
    explanation: { text: 'amo is the verb', tokens: [], annotations: [] },
  });

const tableFillExercise = () =>
  baseExercise('table-fill', {
    title: 'Conjugation',
    columns: [{ id: 'col-1', header: 'Verb' }, { id: 'col-2', header: 'Meaning' }],
    rows: [{ id: 'row-1', cells: { 'col-1': { content: 'amo', isBlank: false }, 'col-2': { content: '', isBlank: true, answer: 'love' } } }],
    footnotes: ['Present tense'],
    explanation: 'amo means love',
  });

const clickOnMultipleWordsExercise = () =>
  baseExercise('click-on-multiple-words', {
    passage: 'amo et ambulo',
    correctWordIndices: [0],
    instructions: 'Click the verb of loving',
    explanation: 'amo',
  });

const generatedTranslationExercise = () =>
  baseExercise('generated-translation', {
    generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 1 },
    posConfigs: { verb: { enabled: true, filters: {} } },
  });

const generatedFormIdentificationExercise = (mode = 'step-by-step') =>
  baseExercise('generated-form-identification', {
    mode,
    generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 1 },
    paradigmConfigs: {},
  });

const translationGradingExercise = () =>
  baseExercise('translation-grading', {
    items: [{ latinText: 'amo et ambulo', instructions: 'Translate into English' }],
  });

const stepFormItem = {
  id: 'form-1',
  wordId: 'word-1',
  word: 'amo',
  root_word: 'amo',
  dictionary_entry: null,
  selected_form: 'amare',
  hasSelectedForm: true,
  step: 'tense',
  correctAnswer: 'present',
  acceptedAnswers: ['present'],
  primaryFormPaths: [{ tense: 'present' }],
  optionalFormPaths: [],
};

const singleFieldFormItem = {
  id: 'form-2',
  wordId: 'word-2',
  word: 'puella',
  root_word: 'puella',
  dictionary_entry: null,
  selected_form: 'puella',
  hasSelectedForm: true,
  steps: ['case', 'number'],
  correctAnswerDisplay: 'nominative, singular',
  primaryFormPaths: [{ case: 'nominative', number: 'singular' }],
  optionalFormPaths: [],
};

const multiAnswerFormItem = {
  id: 'form-3',
  wordId: 'word-3',
  word: 'porta',
  root_word: 'porta',
  dictionary_entry: null,
  selected_form: 'porta',
  hasSelectedForm: true,
  step: 'case',
  steps: ['case', 'number'],
  stepIndex: 0,
  totalSteps: 2,
  expectedAnswerCount: 2,
  correctAnswerDisplay: 'nominative, vocative',
  primaryFormPaths: [
    { case: 'nominative', number: 'singular' },
    { case: 'vocative', number: 'singular' },
  ],
  optionalFormPaths: [],
};

const origin = { kind: 'normal-test' as const, testId: 'test-1' };

const buildReview = (
  pages: Array<{ items: unknown[]; title?: string; audioPath?: string | null }>,
  options: {
    answers?: Record<string, ExerciseAnswer | unknown>;
    translationGrades?: Record<string, Record<string, { translation: string; score: number; feedback: string }>>;
    exerciseResults?: Record<string, { title?: string; awardedPoints: number; maxPoints: number }>;
    resolvedExercises?: Record<string, { items: unknown[] }>;
    vocabularyPool?: {
      id: string;
      name: string;
      items: Array<Record<string, unknown>>;
    };
  } = {}
) =>
  buildSubmittedReview({
    attemptId: 'attempt-1',
    studentId: 'student-1',
    versionId: 'version-1',
    origin,
    submittedAt: '2026-08-19T12:00:00.000Z',
    createdAt: '2026-08-19T12:00:00.000Z',
    deliveryState: {
      versionId: 'version-1',
      pages: pages.map((page, index) => ({
        id: `page-${index}`,
        ...page,
      })),
      resolvedExercises: (options.resolvedExercises ?? {}) as never,
      ...(options.vocabularyPool ? { vocabularyPool: options.vocabularyPool as never } : {}),
    },
    answers: options.answers ?? {},
    translationGrades: options.translationGrades ?? {},
    exerciseResults: options.exerciseResults ?? {},
  });

const exerciseItem = (review: ReturnType<typeof buildReview>, type: string) =>
  review.content.pages.flatMap(page => page.items).find(item => item.type === type) as TestResultReviewExerciseItem;

describe('submitted test review snapshot', () => {
  it('is versioned, self-contained, and passes the durable document schema', () => {
    const review = buildReview(
      [
        {
          title: 'Page one',
          audioPath: 'audio/page.mp3',
          items: [
            { id: 'text-1', type: 'text', title: 'Passage', content: 'Some context' },
            fillExercise(),
          ],
        },
      ],
      {
        answers: { 'ex-fill': { type: 'fill', answers: ['love', 'walk'] } },
        exerciseResults: { 'ex-fill': { awardedPoints: 10, maxPoints: 10 } },
      }
    );

    expect(review.reviewVersion).toBe(1);
    expect(review.attemptId).toBe('attempt-1');
    expect(review.studentId).toBe('student-1');
    expect(review.origin).toEqual(origin);
    expect(review.content.pages).toHaveLength(1);
    expect(review.content.pages[0].audioPath).toBe('audio/page.mp3');
    expect(review.content.pages[0].items[0]).toMatchObject({ type: 'text', content: 'Some context' });
    expect(review.content.pages[0].items[1]).toMatchObject({
      type: 'fill',
      question: { items: [{ text: 'amo' }, { text: 'ambulo' }] },
    });
    expect(review.content.pages[0].items[1]).not.toHaveProperty('question.data');
    expect(testResultReviewDocumentSchema.safeParse(review).success).toBe(true);

    const stripped = toStudentTestResultReview(review);
    expect(stripped).not.toHaveProperty('studentId');
  });

  it('keeps answer keys out of supporting content and includes playable audio paths', () => {
    const review = buildReview(
      [
        {
          items: [
          { id: 'text-1', type: 'text', content: 'Passage', audioPath: 'audio/passage.mp3' },
          { id: 'em-1', type: 'emphasis', content: 'Emphasis' },
          {
            id: 'table-1',
            type: 'table',
            tableData: {
              title: 'Table',
              columns: [{ id: 'c1', header: 'A' }],
              rows: [{ id: 'r1', cells: { c1: 'value' } }],
              footnotes: ['note'],
            },
          },
          {
            id: 'vocab-1',
            type: 'vocabulary',
            vocabularyItems: [{ id: 'v1', latin: 'amo', english: 'love', audioPath: 'audio/amo.mp3' }],
          },
          { id: 'pool-1', type: 'vocabulary-pool', title: 'Pool' },
          {
            id: 'listen-1',
            type: 'listening-passage',
            data: { latinText: 'amo', translation: 'I love', passageAudioPath: 'audio/listen.mp3' },
          },
            fillExercise(),
          ],
        },
      ],
      { exerciseResults: { 'ex-fill': { awardedPoints: 0, maxPoints: 10 } } }
    );

    const supporting = review.content.pages[0].items.filter(item => !('answerKey' in item));
    expect(supporting).toHaveLength(6);
    expect(supporting[0]).toMatchObject({ type: 'text', audioPath: 'audio/passage.mp3' });
    expect(supporting[1]).toMatchObject({ type: 'emphasis', content: 'Emphasis' });
    expect(supporting[2]).toMatchObject({ type: 'table' });
    expect(supporting[3]).toMatchObject({ type: 'vocabulary', vocabularyItems: [{ latin: 'amo', audioPath: 'audio/amo.mp3' }] });
    expect(supporting[4]).toMatchObject({ type: 'vocabulary-pool' });
    expect(supporting[5]).toMatchObject({ type: 'listening-passage', data: { passageAudioPath: 'audio/listen.mp3' } });
    for (const item of supporting) expect(item).not.toHaveProperty('answerKey');
  });

  it('captures fill answers, per-blank marks, accepted answers, and explanations', () => {
    const review = buildReview([{ items: [fillExercise()] }], {
      answers: { 'ex-fill': { type: 'fill', answers: ['love', 'wrong'] } },
      exerciseResults: { 'ex-fill': { awardedPoints: 5, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'fill') as Extract<TestResultReviewExerciseItem, { type: 'fill' }>;

    expect(item.result).toEqual({ awardedPoints: 5, maxPoints: 10 });
    expect(item.studentAnswer).toEqual({ type: 'fill', answers: ['love', 'wrong'] });
    expect(item.answerKey.items[0]).toMatchObject({ text: 'amo', acceptedAnswers: ['love'], explanation: 'First person singular' });
    expect(item.answerKey.items[1]).toMatchObject({ text: 'ambulo', acceptedAnswers: ['walk'] });
    expect(item.itemResults.answers).toEqual([
      { value: 'love', correct: true, points: { awardedPoints: 5, maxPoints: 5 } },
      { value: 'wrong', correct: false, points: { awardedPoints: 0, maxPoints: 5 } },
    ]);
  });

  it('captures unanswered exercises without failing the snapshot', () => {
    const review = buildReview([{ items: [fillExercise()] }], {
      exerciseResults: { 'ex-fill': { awardedPoints: 0, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'fill') as Extract<TestResultReviewExerciseItem, { type: 'fill' }>;
    expect(item.studentAnswer).toBeNull();
    expect(item.itemResults.answers).toEqual([
      { value: '', correct: false, points: { awardedPoints: 0, maxPoints: 5 } },
      { value: '', correct: false, points: { awardedPoints: 0, maxPoints: 5 } },
    ]);
  });

  it('captures matching pairs, every accepted pair, and per-round correctness', () => {
    const review = buildReview([{ items: [matchingExercise()] }], {
      answers: { 'ex-matching': { type: 'matching', rounds: [{ 'left-1': 'right-2', 'left-2': 'right-2' }] } },
      exerciseResults: { 'ex-matching': { awardedPoints: 5, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'matching') as Extract<TestResultReviewExerciseItem, { type: 'matching' }>;

    expect(item.answerKey.pairs).toEqual([
      { leftId: 'left-1', leftValue: 'amo', rightId: 'right-1', rightValue: 'love' },
      { leftId: 'left-2', leftValue: 'ambulo', rightId: 'right-2', rightValue: 'walk' },
    ]);
    expect(item.itemResults.rounds).toEqual([
      {
        'left-1': { rightId: 'right-2', correct: false, points: { awardedPoints: 0, maxPoints: 5 } },
        'left-2': { rightId: 'right-2', correct: true, points: { awardedPoints: 5, maxPoints: 5 } },
      },
    ]);
  });

  it('captures multiple-choice options with the correct option and the student selection', () => {
    const review = buildReview([{ items: [multipleChoiceExercise()] }], {
      answers: { 'ex-multiple-choice': { type: 'multiple-choice', selectedOptionIds: ['opt-2'] } },
      exerciseResults: { 'ex-multiple-choice': { awardedPoints: 0, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'multiple-choice') as Extract<TestResultReviewExerciseItem, { type: 'multiple-choice' }>;

    expect(item.explanation).toBe('amo means love');
    expect(item.answerKey.options).toEqual([
      { id: 'opt-1', text: 'love', isCorrect: true },
      { id: 'opt-2', text: 'hate', isCorrect: false },
    ]);
    expect(item.itemResults).toEqual({
      selectedOptionIds: ['opt-2'],
      correct: false,
      points: { awardedPoints: 0, maxPoints: 10 },
    });
  });

  it('captures odd-one-out with the odd item, explanation, and student explanation', () => {
    const review = buildReview([{ items: [oddOneOutExercise()] }], {
      answers: { 'ex-odd-one-out': { type: 'odd-one-out', selectedItemId: 'odd-1', explanation: 'Because' } },
      exerciseResults: { 'ex-odd-one-out': { awardedPoints: 10, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'odd-one-out') as Extract<TestResultReviewExerciseItem, { type: 'odd-one-out' }>;

    expect(item.explanation).toBe('amo is not motion');
    expect(item.answerKey.items.find(entry => entry.isOddOneOut)).toMatchObject({ id: 'odd-1', text: 'amo' });
    expect(item.itemResults).toEqual({
      selectedItemId: 'odd-1',
      explanation: 'Because',
      correct: true,
      points: { awardedPoints: 10, maxPoints: 10 },
    });
  });

  it('captures text-selection word indices and explanations per question', () => {
    const review = buildReview([{ items: [textSelectionExercise()] }], {
      answers: { 'ex-text-selection': { type: 'text-selection', selectedWordIndices: [0] } },
      exerciseResults: { 'ex-text-selection': { awardedPoints: 0, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'text-selection') as Extract<TestResultReviewExerciseItem, { type: 'text-selection' }>;

    expect(item.answerKey.questions[0]).toMatchObject({ id: 'q-1', correctWordIndex: 2, explanation: 'ambulo' });
    expect(item.itemResults.selections).toEqual([
      {
        questionId: 'q-1',
        wordIndex: 0,
        correct: false,
        points: { awardedPoints: 0, maxPoints: 10 },
      },
    ]);
  });

  it('captures fill-embolded-text answers and correct answers', () => {
    const review = buildReview([{ items: [fillEmboldedTextExercise()] }], {
      answers: { 'ex-fill-embolded-text': { type: 'fill-embolded-text', answers: ['love'] } },
      exerciseResults: { 'ex-fill-embolded-text': { awardedPoints: 10, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'fill-embolded-text') as Extract<TestResultReviewExerciseItem, { type: 'fill-embolded-text' }>;

    expect(item.answerKey.words[0]).toMatchObject({ wordIndex: 2, correctAnswer: 'love', explanation: 'love' });
    expect(item.itemResults.answers).toEqual([
      { value: 'love', correct: true, points: { awardedPoints: 10, maxPoints: 10 } },
    ]);
  });

  it('captures sentence diagrams side by side with the solution and accuracy', () => {
    const review = buildReview([{ items: [sentenceDiagrammingExercise()] }], {
      answers: {
        'ex-sentence-diagramming': {
          type: 'sentence-diagramming',
          annotations: [],
        },
      },
      exerciseResults: { 'ex-sentence-diagramming': { awardedPoints: 10, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'sentence-diagramming') as Extract<
      TestResultReviewExerciseItem,
      { type: 'sentence-diagramming' }
    >;

    expect(item.answerKey).toMatchObject({ latin: 'amo', translation: 'I love', solutionAnnotations: [] });
    expect(item.answerKey.explanation).toMatchObject({ text: 'amo is the verb' });
    expect(item.itemResults).toMatchObject({ accuracy: 100, correct: true, annotations: [] });
  });

  it('captures table-fill per-cell answers and marks', () => {
    const review = buildReview([{ items: [tableFillExercise()] }], {
      answers: { 'ex-table-fill': { type: 'table-fill', answers: { 'row-1-col-2': 'wrong' } } },
      exerciseResults: { 'ex-table-fill': { awardedPoints: 0, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'table-fill') as Extract<TestResultReviewExerciseItem, { type: 'table-fill' }>;

    expect(item.answerKey.rows[0].cells['col-2']).toMatchObject({ isBlank: true, answer: 'love' });
    expect(item.itemResults.cells).toEqual([
      {
        rowId: 'row-1',
        columnId: 'col-2',
        value: 'wrong',
        correct: false,
        points: { awardedPoints: 0, maxPoints: 10 },
      },
    ]);
    expect(item.explanation).toBe('amo means love');
  });

  it('captures click-on-multiple-words selections against the required indices', () => {
    const review = buildReview([{ items: [clickOnMultipleWordsExercise()] }], {
      answers: { 'ex-click-on-multiple-words': { type: 'click-on-multiple-words', selectedWordIndices: [0] } },
      exerciseResults: { 'ex-click-on-multiple-words': { awardedPoints: 10, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'click-on-multiple-words') as Extract<
      TestResultReviewExerciseItem,
      { type: 'click-on-multiple-words' }
    >;

    expect(item.answerKey).toEqual({ correctWordIndices: [0] });
    expect(item.itemResults).toEqual({
      selectedWordIndices: [0],
      correct: true,
      points: { awardedPoints: 10, maxPoints: 10 },
    });
    expect(item.explanation).toBe('amo');
  });

  it('captures generated-translation accepted answer lists and per-item marks', () => {
    const review = buildReview([{ items: [generatedTranslationExercise()] }], {
      resolvedExercises: {
        'ex-generated-translation': { items: [{ text: 'amo', acceptedAnswers: ['love', 'like'] }] },
      },
      answers: { 'ex-generated-translation': { type: 'generated-translation', answers: ['like'] } },
      exerciseResults: { 'ex-generated-translation': { awardedPoints: 10, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'generated-translation') as Extract<
      TestResultReviewExerciseItem,
      { type: 'generated-translation' }
    >;

    expect(item.answerKey.items[0]).toEqual({ text: 'amo', acceptedAnswers: ['love', 'like'] });
    expect(item.itemResults.answers).toEqual([
      { value: 'like', correct: true, points: { awardedPoints: 10, maxPoints: 10 } },
    ]);
  });

  it('captures step-by-step generated-form-identification accepted answers', () => {
    const review = buildReview([{ items: [generatedFormIdentificationExercise('step-by-step')] }], {
      resolvedExercises: { 'ex-generated-form-identification': { items: [stepFormItem] } },
      answers: { 'ex-generated-form-identification': { type: 'generated-form-identification', answers: { 'form-1': 'present' } } },
      exerciseResults: { 'ex-generated-form-identification': { awardedPoints: 10, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'generated-form-identification') as Extract<
      TestResultReviewExerciseItem,
      { type: 'generated-form-identification' }
    >;

    expect(item.answerKey.items[0]).toMatchObject({
      id: 'form-1',
      word: 'amo',
      step: 'tense',
      correctAnswer: 'present',
      acceptedAnswers: ['present'],
    });
    expect(item.itemResults.answers).toEqual([
      {
        id: 'form-1',
        value: 'present',
        correct: true,
        points: { awardedPoints: 10, maxPoints: 10 },
      },
    ]);
  });

  it('captures partial-credit points for single-field generated-form-identification answers', () => {
    const review = buildReview([{ items: [generatedFormIdentificationExercise('single-field')] }], {
      resolvedExercises: {
        'ex-generated-form-identification': { items: [singleFieldFormItem] },
      },
      answers: {
        'ex-generated-form-identification': {
          type: 'generated-form-identification',
          answers: { 'form-2': 'nominative, wrong' },
        },
      },
      exerciseResults: { 'ex-generated-form-identification': { awardedPoints: 5, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'generated-form-identification') as Extract<
      TestResultReviewExerciseItem,
      { type: 'generated-form-identification' }
    >;

    expect(item.answerKey.items[0]).toMatchObject({ id: 'form-2', steps: ['case', 'number'], correctAnswerDisplay: 'nominative, singular' });
    expect(item.itemResults.answers).toEqual([
      {
        id: 'form-2',
        value: 'nominative, wrong',
        correct: false,
        points: { awardedPoints: 5, maxPoints: 10 },
      },
    ]);
  });

  it('marks multi-answer steps using the same compatible-path sequence as grading', () => {
    const paths = [
      { case: 'nominative', number: 'singular' },
      { case: 'accusative', number: 'plural' },
    ];
    const caseItem = {
      ...multiAnswerFormItem,
      id: 'form-case',
      step: 'case',
      stepIndex: 0,
      primaryFormPaths: paths,
      correctAnswerDisplay: 'nominative; accusative',
    };
    const numberItem = {
      ...multiAnswerFormItem,
      id: 'form-number',
      step: 'number',
      stepIndex: 1,
      primaryFormPaths: paths,
      correctAnswerDisplay: 'singular; plural',
    };
    const exercise = generatedFormIdentificationExercise('step-by-step');
    (exercise as Extract<Exercise, { type: 'generated-form-identification' }>).data.requireAllPrimaryAnswers = true;
    const review = buildReview([{ items: [exercise] }], {
      resolvedExercises: { 'ex-generated-form-identification': { items: [caseItem, numberItem] } },
      answers: {
        'ex-generated-form-identification': {
          type: 'generated-form-identification',
          answers: {
            'form-case': 'nominative; accusative',
            'form-number': 'plural; singular',
          },
        },
      },
      exerciseResults: { 'ex-generated-form-identification': { awardedPoints: 5, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'generated-form-identification') as Extract<
      TestResultReviewExerciseItem,
      { type: 'generated-form-identification' }
    >;

    expect(item.itemResults.answers).toEqual([
      {
        id: 'form-case',
        value: 'nominative; accusative',
        correct: true,
        points: { awardedPoints: 5, maxPoints: 5 },
      },
      {
        id: 'form-number',
        value: 'plural; singular',
        correct: false,
        points: { awardedPoints: 0, maxPoints: 5 },
      },
    ]);
  });

  it('captures translation grading with the student text, score out of 10, and saved AI feedback', () => {
    const review = buildReview([{ items: [translationGradingExercise()] }], {
      answers: { 'ex-translation-grading': { type: 'translation-grading', translations: ['I love walking'] } },
      translationGrades: {
        'ex-translation-grading': { '0': { translation: 'I love walking', score: 8, feedback: 'Very close' } },
      },
      exerciseResults: { 'ex-translation-grading': { awardedPoints: 8, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'translation-grading') as Extract<
      TestResultReviewExerciseItem,
      { type: 'translation-grading' }
    >;

    expect(item.itemResults.items).toEqual([
      {
        translation: 'I love walking',
        score: 8,
        feedback: 'Very close',
        points: { awardedPoints: 8, maxPoints: 10 },
      },
    ]);
    expect(item.answerKey.items[0]).toMatchObject({ latinText: 'amo et ambulo' });
  });

  it('only reports saved AI feedback when it matches the saved translation', () => {
    const review = buildReview([{ items: [translationGradingExercise()] }], {
      answers: { 'ex-translation-grading': { type: 'translation-grading', translations: ['Changed after grading'] } },
      translationGrades: {
        'ex-translation-grading': { '0': { translation: 'I love walking', score: 8, feedback: 'Very close' } },
      },
      exerciseResults: { 'ex-translation-grading': { awardedPoints: 0, maxPoints: 10 } },
    });
    const item = exerciseItem(review, 'translation-grading') as Extract<
      TestResultReviewExerciseItem,
      { type: 'translation-grading' }
    >;

    expect(item.itemResults.items).toEqual([
      {
        translation: 'Changed after grading',
        score: null,
        feedback: null,
        points: { awardedPoints: 0, maxPoints: 10 },
      },
    ]);
  });

  it('copies the resolved vocabulary pool for pool-backed delivery', () => {
    const review = buildReview(
      [{ items: [{ id: 'pool-1', type: 'vocabulary-pool', title: 'Pool' }] }],
      {
        vocabularyPool: {
          id: 'pool-a',
          name: 'Chapter one',
          items: [{ id: 'v1', latin: 'amo', english: 'love', pronunciation: 'AH-mo', audioPath: 'audio/v1.mp3' }],
        },
      }
    );

    expect(review.content.vocabularyPool).toMatchObject({
      id: 'pool-a',
      name: 'Chapter one',
      items: [{ id: 'v1', latin: 'amo', english: 'love', audioPath: 'audio/v1.mp3' }],
    });
  });

  it('rejects malformed known exercise variants instead of returning unsafe review data', () => {
    const review = buildReview([{ items: [fillExercise()] }], {
      exerciseResults: { 'ex-fill': { awardedPoints: 0, maxPoints: 10 } },
    });
    const malformed = JSON.parse(JSON.stringify(review)) as {
      content: { pages: Array<{ items: Array<Record<string, unknown>> }> };
    };
    malformed.content.pages[0].items[0].question = { data: { items: [] } };

    expect(testResultReviewDocumentSchema.safeParse(malformed).success).toBe(false);
  });
});
