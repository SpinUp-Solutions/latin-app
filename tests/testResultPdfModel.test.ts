import { sourceTitleFromDocument, studentIdentityFromProfile } from '@/src/lib/tests/result-pdf-identity';
import { buildTestResultPdfModel, pdfExerciseText } from '@/src/lib/tests/result-pdf-model';
import type { StudentTestResult, TestResultReviewItem } from '@/src/types/test-results';

const submittedAt = '2026-08-19T12:00:00.000Z';

const attempt = (overrides: Partial<StudentTestResult['attempt']> = {}): StudentTestResult['attempt'] => ({
  id: 'attempt-1',
  versionId: 'version-1',
  passingPercentage: 70,
  origin: { kind: 'normal-test', testId: 'test-1' },
  startedAt: submittedAt,
  updatedAt: submittedAt,
  status: 'submitted',
  exerciseResults: {
    'ex-fill-1': { title: 'Fill ex-fill-1', awardedPoints: 5, maxPoints: 10 },
  },
  score: 5,
  maxScore: 10,
  percentage: 50,
  outcome: 'not-passed',
  submittedAt,
  ...overrides,
});

const fillItem = (withHtml = false): TestResultReviewItem =>
  ({
    id: 'ex-fill-1',
    type: 'fill',
    title: withHtml ? '<p>Fill <em>verbs</em></p>' : 'Fill verbs',
    instructions: '',
    maxPoints: 10,
    studentAnswer: { type: 'fill', answers: ['wrong', 'walk'] },
    result: { awardedPoints: 5, maxPoints: 10 },
    question: { items: [{ text: withHtml ? '<p>amō</p>' : 'amo' }, { text: 'ambulo' }] },
    answerKey: {
      items: [
        {
          text: withHtml ? '<p>amō</p>' : 'amo',
          acceptedAnswers: ['love'],
          explanation: withHtml ? '<p>Because amo is a verb of loving</p>' : 'Because amo is a verb of loving',
        },
        { text: 'ambulo', acceptedAnswers: ['walk'] },
      ],
    },
    itemResults: {
      answers: [
        { value: 'wrong', correct: false, points: { awardedPoints: 0, maxPoints: 5 } },
        { value: 'walk', correct: true, points: { awardedPoints: 5, maxPoints: 5 } },
      ],
    },
  }) as TestResultReviewItem;

const translationItem = (): TestResultReviewItem =>
  ({
    id: 'ex-translation',
    type: 'translation-grading',
    title: 'Translate the passage',
    instructions: '',
    maxPoints: 10,
    studentAnswer: { type: 'translation-grading', translations: ['I love walking'] },
    result: { awardedPoints: 8, maxPoints: 10 },
    question: { items: [{ latinText: 'amo et ambulo' }] },
    answerKey: { items: [{ latinText: 'amo et ambulo' }] },
    itemResults: {
      items: [
        {
          translation: 'I love walking',
          score: 8,
          feedback: 'Very close, but check the conjunction.',
          points: { awardedPoints: 8, maxPoints: 10 },
        },
      ],
    },
  }) as TestResultReviewItem;

const buildResult = (items: TestResultReviewItem[] | null): StudentTestResult => ({
  attempt: attempt(),
  review:
    items === null
      ? null
      : {
          id: 'attempt-1',
          reviewVersion: 1,
          attemptId: 'attempt-1',
          versionId: 'version-1',
          origin: { kind: 'normal-test', testId: 'test-1' },
          submittedAt,
          content: {
            pages: [{ id: 'page-0', title: 'Page 1', items }],
          },
        },
});

const identity = studentIdentityFromProfile({
  firstName: 'Jane',
  lastName: 'Doe',
  username: 'jdoe',
  email: 'jane@school.edu',
});

describe('test result PDF model', () => {
  it('includes fill answers, accepted answers, and explanations', () => {
    const model = buildTestResultPdfModel({
      result: buildResult([fillItem()]),
      identity,
      source: sourceTitleFromDocument({ kind: 'normal-test', testId: 'test-1' }, { title: 'Chapter 3 Quiz' }),
    });

    expect(model.kindLabel).toBe('Test');
    expect(model.title).toBe('Chapter 3 Quiz');
    expect(model.studentName).toBe('Jane Doe');
    expect(model.percentageLabel).toBe('50%');
    expect(model.outcomeLabel).toBe('Not passed');
    expect(model.exercises[0]?.statusLabel).toBe('Partly correct');
    const lines = pdfExerciseText(model.exercises[0]!);
    expect(lines).toContain('Your answer: wrong');
    expect(lines).toContain('Accepted answer: love');
    expect(lines).toContain('Explanation: Because amo is a verb of loving');
    expect(lines).toContain('Your answer: walk');
  });

  it('strips HTML from prompts and explanations', () => {
    const model = buildTestResultPdfModel({
      result: buildResult([fillItem(true)]),
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    });

    const text = [model.exercises[0]?.title, pdfExerciseText(model.exercises[0]!)].join('\n');
    expect(text).not.toContain('<p>');
    expect(text).not.toContain('<em>');
    expect(text).toContain('Fill verbs');
    expect(text).toContain('amō');
    expect(text).toContain('Because amo is a verb of loving');
  });

  it('includes AI translation score and feedback', () => {
    const model = buildTestResultPdfModel({
      result: buildResult([translationItem()]),
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    });

    const lines = pdfExerciseText(model.exercises[0]!);
    expect(lines).toContain('amo et ambulo');
    expect(lines).toContain('Your translation');
    expect(lines).toContain('I love walking');
    expect(lines).toContain('AI score: 8 / 10');
    expect(lines).toContain('AI feedback');
    expect(lines).toContain('Very close, but check the conjunction.');
  });

  it('labels mock results separately from official tests', () => {
    const model = buildTestResultPdfModel({
      result: {
        ...buildResult([fillItem()]),
        attempt: attempt({ origin: { kind: 'mock-test', mockTestId: 'mock-1' } }),
      },
      identity,
      source: sourceTitleFromDocument({ kind: 'mock-test', mockTestId: 'mock-1' }, { title: 'Practice mock' }),
    });

    expect(model.kindLabel).toBe('Mock test');
    expect(model.title).toBe('Practice mock');
  });

  it('falls back to the frozen score summary when the review is missing', () => {
    const model = buildTestResultPdfModel({
      result: buildResult(null),
      identity,
      source: { kindLabel: 'Test', title: 'Chapter 3 Quiz' },
    });

    expect(model.exercises).toEqual([]);
    expect(model.reviewUnavailableNote).toMatch(/question-by-question review could not be loaded/);
    expect(model.exerciseSummaries).toEqual([
      {
        number: 1,
        title: 'Fill ex-fill-1',
        awardedPoints: '5',
        maxPoints: '10',
        statusLabel: 'Partly correct',
      },
    ]);
  });

  it('keeps matching, choice, table, and selected-word answers explicit', () => {
    const matching: TestResultReviewItem = {
      id: 'ex-match',
      type: 'matching',
      title: 'Match the verbs',
      maxPoints: 2,
      studentAnswer: { type: 'matching', rounds: [{ 'left-1': 'right-2' }] },
      result: { awardedPoints: 0, maxPoints: 2 },
      question: {
        leftColumn: [{ id: 'left-1', value: 'amo' }],
        rightColumn: [
          { id: 'right-1', value: 'I love' },
          { id: 'right-2', value: 'I walk' },
        ],
        expectedMatchCount: 1,
      },
      answerKey: { pairs: [{ leftId: 'left-1', leftValue: 'amo', rightId: 'right-1', rightValue: 'I love' }] },
      itemResults: { rounds: [] },
    } as unknown as TestResultReviewItem;

    const choice: TestResultReviewItem = {
      id: 'ex-choice',
      type: 'multiple-choice',
      title: 'Choose',
      maxPoints: 1,
      studentAnswer: { type: 'multiple-choice', selectedOptionIds: ['b'] },
      result: { awardedPoints: 0, maxPoints: 1 },
      question: { question: 'What is amo?', options: [], allowMultipleSelections: false },
      answerKey: {
        options: [
          { id: 'a', text: 'I love', isCorrect: true },
          { id: 'b', text: 'I walk', isCorrect: false },
        ],
      },
      itemResults: { selectedOptionIds: ['b'], correct: false, points: { awardedPoints: 0, maxPoints: 1 } },
    } as TestResultReviewItem;

    const table: TestResultReviewItem = {
      id: 'ex-table',
      type: 'table-fill',
      title: 'Fill the table',
      maxPoints: 1,
      studentAnswer: { type: 'table-fill', answers: { 'row-1-col-1': 'walk' } },
      result: { awardedPoints: 0, maxPoints: 1 },
      question: {
        columns: [{ id: 'col-1', header: 'Meaning' }],
        rows: [{ id: 'row-1', cells: { 'col-1': { content: '', isBlank: true } } }],
      },
      answerKey: {
        rows: [{ id: 'row-1', cells: { 'col-1': { content: '', isBlank: true, answer: 'love' } } }],
      },
      itemResults: { cells: [] },
    } as unknown as TestResultReviewItem;

    const click: TestResultReviewItem = {
      id: 'ex-click',
      type: 'click-on-multiple-words',
      title: 'Click the verbs',
      maxPoints: 2,
      studentAnswer: { type: 'click-on-multiple-words', selectedWordIndices: [0] },
      result: { awardedPoints: 1, maxPoints: 2 },
      question: { passage: 'amo et ambulo' },
      answerKey: { correctWordIndices: [0, 2] },
      itemResults: {
        selectedWordIndices: [],
        correct: false,
        points: { awardedPoints: 1, maxPoints: 2 },
      },
    } as TestResultReviewItem;

    const translation: TestResultReviewItem = {
      ...translationItem(),
      studentAnswer: { type: 'translation-grading', translations: ['I love\nand I walk'] },
      itemResults: {
        items: [
          {
            translation: 'I love\nand I walk',
            score: 8,
            feedback: 'Line two needs the conjunction.',
            points: { awardedPoints: 8, maxPoints: 10 },
          },
        ],
      },
    } as TestResultReviewItem;

    const model = buildTestResultPdfModel({
      result: buildResult([matching, choice, table, click, translation]),
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    });

    const matchingText = pdfExerciseText(model.exercises[0]!);
    expect(matchingText).toContain('Your matches');
    expect(matchingText).toContain('amo ↔ I walk');
    expect(matchingText).toContain('Correct matches');
    expect(matchingText).toContain('amo ↔ I love');

    const choiceText = pdfExerciseText(model.exercises[1]!);
    expect(choiceText).toContain('Your answer');
    expect(choiceText).toContain('I walk');
    expect(choiceText).toContain('Correct answer');
    expect(choiceText).toContain('I love');

    const tableText = pdfExerciseText(model.exercises[2]!);
    expect(tableText).toContain('Your answer: walk');
    expect(tableText).toContain('Correct answer: love');

    const clickText = pdfExerciseText(model.exercises[3]!);
    expect(clickText).toContain('Your selected words');
    expect(clickText).toContain('amo');
    expect(clickText).toContain('Correct words');
    expect(clickText).toContain('ambulo');

    const translationText = pdfExerciseText(model.exercises[4]!);
    expect(translationText).toContain('I love');
    expect(translationText).toContain('and I walk');
    expect(translationText).toContain('Line two needs the conjunction.');
  });
});
