import { sourceTitleFromDocument, studentIdentityFromProfile } from '@/src/lib/tests/result-pdf-identity';
import { buildTestResultPdfModel } from '@/src/lib/tests/result-pdf-model';
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
    const lines = model.exercises[0]?.groups.flatMap(group => group.lines).join('\n') ?? '';
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

    const text = [model.exercises[0]?.title, ...(model.exercises[0]?.groups.flatMap(group => group.lines) ?? [])].join(
      '\n'
    );
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

    const lines = model.exercises[0]?.groups.flatMap(group => group.lines).join('\n') ?? '';
    expect(lines).toContain('amo et ambulo');
    expect(lines).toContain('Your translation: I love walking');
    expect(lines).toContain('AI score: 8 / 10');
    expect(lines).toContain('AI feedback: Very close, but check the conjunction.');
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
      { number: 1, title: 'Fill ex-fill-1', awardedPoints: '5', maxPoints: '10' },
    ]);
  });
});
