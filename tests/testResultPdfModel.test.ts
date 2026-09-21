/** @jest-environment node */

import { sourceTitleFromDocument, studentIdentityFromProfile } from '@/src/lib/tests/result-pdf-identity';
import {
  buildTestResultPdfModel,
  RESULT_PDF_PAIR_SEPARATOR,
  type TestResultPdfExercise,
} from '@/src/lib/tests/result-pdf-model';
import type { StudentTestResult, TestResultReviewItem } from '@/src/types/test-results';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';

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
    explanation: withHtml ? '<p>Because amo is a verb of loving</p>' : 'Because amo is a verb of loving',
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

const pdfExerciseText = (exercise: TestResultPdfExercise): string =>
  exercise.groups.flatMap(group => [group.heading, ...group.lines].filter(Boolean)).join('\n');

const headings = (exercise: TestResultPdfExercise): string[] =>
  exercise.groups.map(group => group.heading).filter((value): value is string => Boolean(value));

const expectHeadingOrder = (exercise: TestResultPdfExercise, earlier: string, later: string) => {
  const order = headings(exercise);
  const left = order.indexOf(earlier);
  const right = order.indexOf(later);
  expect(left).toBeGreaterThanOrEqual(0);
  expect(right).toBeGreaterThan(left);
};

const feedbackOrExplanation =
  /explanation|ai feedback|because amo is a verb of loving|very close, but check|line two needs the conjunction|the second word/i;

describe('test result PDF model', () => {
  it('includes fill scores, expected answers, then student answers without explanations', () => {
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
    const exercise = model.exercises[0]!;
    const lines = pdfExerciseText(exercise);
    expect(lines).toContain('Incorrect · 0 / 5 points');
    expect(lines).toContain('Correct · 5 / 5 points');
    expect(lines).toContain('love');
    expect(lines).not.toContain('Accepted answer:');
    expect(lines).toContain('wrong');
    expect(lines).toContain('walk');
    expect(lines).not.toMatch(feedbackOrExplanation);
    expect(headings(exercise).filter(heading => heading === 'Expected answer').length).toBe(2);
    expect(headings(exercise).filter(heading => heading === 'Student answer').length).toBe(2);
    expectHeadingOrder(exercise, 'Blank 1', 'Question');
    expectHeadingOrder(exercise, 'Question', 'Expected answer');
    expectHeadingOrder(exercise, 'Expected answer', 'Student answer');
    expect(headings(exercise)).not.toContain('Context');
    expect(headings(exercise)).not.toContain('Instructions');
    expect(exercise.groups.find(group => group.heading === 'Expected answer')?.tone).toBe('answer');
    expect(exercise.groups.find(group => group.heading === 'Student answer')?.tone).toBe('incorrect');
  });

  it('strips HTML from prompts and omits answer-key explanations', () => {
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
    expect(text).not.toContain('Because amo is a verb of loving');
    expect(text).not.toMatch(/explanation/i);
  });

  it('includes AI translation score but omits feedback prose', () => {
    const model = buildTestResultPdfModel({
      result: buildResult([translationItem()]),
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    });

    const exercise = model.exercises[0]!;
    const lines = pdfExerciseText(exercise);
    expect(lines).toContain('AI score');
    expect(lines).toContain('8 / 10');
    expect(lines).toContain('amo et ambulo');
    expect(lines).toContain('I love walking');
    expect(lines).not.toContain('AI feedback');
    expect(lines).not.toContain('Very close, but check the conjunction.');
    expect(exercise.statusLabel).toBe('Partly correct');
    expect(exercise.awardedPoints).toBe('8');
    expectHeadingOrder(exercise, 'AI score', 'Question');
    expectHeadingOrder(exercise, 'Question', 'Student answer');
    expect(headings(exercise)).not.toContain('Instructions');
    expect(headings(exercise)).not.toContain('Context');
    expect(lines).not.toContain('No reference translation was recorded.');
    expect(headings(exercise)).not.toContain('Expected answer');
    expect(exercise.groups.find(group => group.heading === 'Student answer')?.tone).toBe('partial');
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
    expect(matchingText).toContain('Expected answer');
    expect(matchingText).toContain('Student answer');
    expect(matchingText).toContain(`amo${RESULT_PDF_PAIR_SEPARATOR}I walk`);
    expect(matchingText).toContain(`amo${RESULT_PDF_PAIR_SEPARATOR}I love`);
    expect(matchingText).not.toContain('↔');
    expect(matchingText).not.toContain('→');
    expectHeadingOrder(model.exercises[0]!, 'Expected answer', 'Student answer');
    expect(model.exercises[0]!.groups.find(group => group.heading === 'Expected answer')?.tone).toBe('answer');
    expect(model.exercises[0]!.groups.find(group => group.heading === 'Student answer')?.tone).toBe('incorrect');

    const choiceText = pdfExerciseText(model.exercises[1]!);
    expect(choiceText).toContain('Question');
    expect(choiceText).toContain('Expected answer');
    expect(choiceText).toContain('Student answer');
    expect(choiceText).toContain('I walk');
    expect(choiceText).toContain('I love');
    expectHeadingOrder(model.exercises[1]!, 'Question', 'Expected answer');
    expectHeadingOrder(model.exercises[1]!, 'Expected answer', 'Student answer');
    expect(headings(model.exercises[1]!)).not.toContain('All options');
    expect(choiceText).not.toMatch(/your choice/i);

    expect(model.exercises[2]!.groups.find(group => group.table)?.table).toEqual({
      columns: ['Meaning'],
      rows: [[{ lines: ['walk', 'Expected: love', 'Not scored'], tone: 'neutral' }]],
    });

    const clickText = pdfExerciseText(model.exercises[3]!);
    expect(clickText).toContain('Expected answer');
    expect(clickText).toContain('ambulo');
    expect(clickText).toContain('Student answer');
    expect(clickText).toContain('amo');
    expectHeadingOrder(model.exercises[3]!, 'Question', 'Expected answer');
    expectHeadingOrder(model.exercises[3]!, 'Expected answer', 'Student answer');
    expect(headings(model.exercises[3]!)).not.toContain('Passage with marks');

    const translationText = pdfExerciseText(model.exercises[4]!);
    expect(translationText).toContain('I love');
    expect(translationText).toContain('and I walk');
    expect(translationText).toContain('8 / 10');
    expect(translationText).not.toContain('Line two needs the conjunction.');
    expect(translationText).not.toContain('AI feedback');
    expectHeadingOrder(model.exercises[4]!, 'AI score', 'Question');
    expectHeadingOrder(model.exercises[4]!, 'Question', 'Student answer');
    expect(translationText).not.toContain('No reference translation was recorded.');
  });

  it('preserves table headers, fixed cells, saved answers, and individual marks in the original grid', () => {
    const table = {
      id: 'table',
      type: 'table-fill',
      title: 'Present tense',
      maxPoints: 2,
      instructions: 'Complete the forms.',
      studentAnswer: { type: 'table-fill', answers: { 'r2-form': 'amās' } },
      result: { awardedPoints: 0, maxPoints: 2 },
      question: {
        columns: [
          { id: 'person', header: '<b>Person</b>' },
          { id: 'form', header: 'amāre' },
        ],
      },
      answerKey: {
        rows: [
          {
            id: 'r1',
            cells: {
              person: { content: '<i>1st singular</i>', isBlank: false },
              form: { content: '', isBlank: true, answer: 'amō' },
            },
          },
          {
            id: 'r2',
            cells: {
              person: { content: '2nd singular', isBlank: false },
              form: { content: '', isBlank: true, answer: 'amās' },
            },
          },
        ],
      },
      itemResults: {
        cells: [
          { rowId: 'r1', columnId: 'form', value: 'amat', correct: false, points: { awardedPoints: 0, maxPoints: 1 } },
        ],
      },
    } as unknown as TestResultReviewItem;
    const exercise = buildTestResultPdfModel({
      result: buildResult([table]),
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    }).exercises[0];
    expect(exercise.groups[0].lines).toEqual(['Complete the forms.']);
    expect(exercise.groups.find(group => group.table)?.table).toEqual({
      columns: ['Person', 'amāre'],
      rows: [
        [
          { lines: ['1st singular'] },
          { lines: ['amat', 'Expected: amō', 'Incorrect · 0 / 1 points'], tone: 'incorrect' },
        ],
        [{ lines: ['2nd singular'] }, { lines: ['amās', 'Expected: amās', 'Not scored'], tone: 'neutral' }],
      ],
    });
  });

  it('maps text-selection and click-word indices with the grader word splitter', () => {
    const passage = '<p>amo</p><p>et ambulo</p>';
    const words = stripHtmlTags(passage)
      .split(/\s+/)
      .filter(word => word.trim());
    expect(words).toEqual(['amoet', 'ambulo']);

    const selection: TestResultReviewItem = {
      id: 'ex-select',
      type: 'text-selection',
      title: 'Select the verb',
      maxPoints: 1,
      studentAnswer: { type: 'text-selection', selectedWordIndices: [1] },
      result: { awardedPoints: 1, maxPoints: 1 },
      question: { passage, questions: [{ id: 'q1', text: 'Which word is ambulo?' }] },
      answerKey: {
        questions: [{ id: 'q1', text: 'Which word is ambulo?', correctWordIndex: 1, explanation: 'The second word.' }],
      },
      itemResults: {
        selections: [{ questionId: 'q1', wordIndex: 1, correct: true, points: { awardedPoints: 1, maxPoints: 1 } }],
      },
    } as TestResultReviewItem;

    const click: TestResultReviewItem = {
      id: 'ex-click-html',
      type: 'click-on-multiple-words',
      title: 'Click the verbs',
      maxPoints: 2,
      studentAnswer: { type: 'click-on-multiple-words', selectedWordIndices: [0] },
      result: { awardedPoints: 1, maxPoints: 2 },
      question: { passage },
      answerKey: { correctWordIndices: [0, 1] },
      itemResults: {
        selectedWordIndices: [0],
        correct: false,
        points: { awardedPoints: 1, maxPoints: 2 },
      },
    } as TestResultReviewItem;

    const model = buildTestResultPdfModel({
      result: buildResult([selection, click]),
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    });

    const selectionText = pdfExerciseText(model.exercises[0]!);
    expect(selectionText).toContain('ambulo');
    expect(selectionText).not.toContain('Your word: et');
    expect(selectionText).not.toContain('Correct word: et');
    expect(selectionText).not.toContain('The second word.');
    expect(model.exercises[0]!.groups.find(group => group.heading === 'Expected answer')?.lines).toEqual(['ambulo']);
    expect(model.exercises[0]!.groups.find(group => group.heading === 'Student answer')?.lines).toEqual(['ambulo']);
    expectHeadingOrder(model.exercises[0]!, 'Question', 'Expected answer');
    expectHeadingOrder(model.exercises[0]!, 'Expected answer', 'Student answer');

    const clickText = pdfExerciseText(model.exercises[1]!);
    expect(clickText).toContain('Student answer');
    expect(clickText).toContain('amoet');
    expect(clickText).toContain('Expected answer');
    expect(clickText).toContain('ambulo');
  });

  it.each([
    ['<p>arma&nbsp;virumque cano</p>', 'virumque'],
    ['<p>arma&#160;virumque cano</p>', 'virumque'],
    ['<p>arma&#xA0;virumque cano</p>', 'virumque'],
    ['<p>arma&Tab;virumque cano</p>', 'virumque'],
    ['<p>arma <em>virum</em>que cano</p>', 'virumque'],
    ['<p>arma &amacr;mo cano</p>', 'āmo'],
    ['<p>arma &amp;nbsp; cano</p>', '&nbsp;'],
    ['<p>arma</p><p>virumque cano</p>', 'cano'],
    ['<p>arma<br>virumque cano</p>', 'cano'],
    ['<p title="a > b">arma virumque cano</p>', 'virumque'],
    ['<p>arma <!-- not a word -->virumque cano</p>', 'virumque'],
  ])('preserves browser word indices without a DOM: %s', (passage, expectedWord) => {
    expect(typeof window).toBe('undefined');
    const selection: TestResultReviewItem = {
      id: 'selection',
      type: 'text-selection',
      title: 'Select',
      maxPoints: 1,
      studentAnswer: { type: 'text-selection', selectedWordIndices: [1] },
      result: { awardedPoints: 1, maxPoints: 1 },
      question: { passage, questions: [{ id: 'q1', text: 'Select word two' }] },
      answerKey: { questions: [{ id: 'q1', text: 'Select word two', correctWordIndex: 1 }] },
      itemResults: {
        selections: [{ questionId: 'q1', wordIndex: 1, correct: true, points: { awardedPoints: 1, maxPoints: 1 } }],
      },
    };
    const click: TestResultReviewItem = {
      id: 'click',
      type: 'click-on-multiple-words',
      title: 'Click',
      maxPoints: 1,
      studentAnswer: { type: 'click-on-multiple-words', selectedWordIndices: [1] },
      result: { awardedPoints: 1, maxPoints: 1 },
      question: { passage },
      answerKey: { correctWordIndices: [1] },
      itemResults: { selectedWordIndices: [1], correct: true, points: { awardedPoints: 1, maxPoints: 1 } },
    };
    const model = buildTestResultPdfModel({
      result: buildResult([selection, click]),
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    });
    expect(model.exercises[0]!.groups.find(group => group.heading === 'Expected answer')?.lines).toEqual([
      expectedWord,
    ]);
    expect(model.exercises[0]!.groups.find(group => group.heading === 'Student answer')?.lines).toEqual([expectedWord]);
    expect(model.exercises[1]!.groups.find(group => group.heading === 'Student answer')?.lines).toEqual([expectedWord]);
    expect(model.exercises[1]!.groups.find(group => group.heading === 'Expected answer')?.lines).toEqual([
      expectedWord,
    ]);
  });

  it.each([true, false])(
    'preserves sub-word and multi-token diagram spans (graded annotations: %s)',
    useGradedAnnotations => {
      const studentAnnotations = [
        {
          id: 'student',
          kind: 'nominative' as const,
          span: { startTokenIndex: 0, endTokenIndex: 0, startCharOffset: 0, endCharOffset: 5 },
        },
      ];
      const solutionAnnotations = [
        {
          id: 'ending',
          kind: 'nominative' as const,
          span: { startTokenIndex: 0, endTokenIndex: 0, startCharOffset: 5, endCharOffset: 6 },
        },
        {
          id: 'phrase',
          kind: 'nominative' as const,
          span: { startTokenIndex: 0, endTokenIndex: 1, startCharOffset: 5, endCharOffset: 2 },
        },
        {
          id: 'whole',
          kind: 'nominative' as const,
          span: { startTokenIndex: 0, endTokenIndex: 1, startCharOffset: 0, endCharOffset: 4 },
        },
      ];
      const diagram: TestResultReviewItem = {
        id: 'diagram',
        type: 'sentence-diagramming',
        title: 'Diagram',
        maxPoints: 1,
        studentAnswer: { type: 'sentence-diagramming', annotations: studentAnnotations },
        result: { awardedPoints: 0, maxPoints: 1 },
        question: {
          latin: 'puella amat',
          translation: '',
          tokens: [
            { id: 't0', text: 'puella', index: 0 },
            { id: 't1', text: 'amat', index: 1 },
          ],
        },
        answerKey: {
          latin: 'puella amat',
          tokens: [
            { id: 't0', text: 'puella', index: 0 },
            { id: 't1', text: 'amat', index: 1 },
          ],
          solutionAnnotations,
          explanation: { text: 'Nominative marks the subject.', tokens: [], annotations: [] },
        },
        itemResults: {
          annotations: useGradedAnnotations ? studentAnnotations : [],
          accuracy: 0,
          correct: false,
          points: { awardedPoints: 0, maxPoints: 1 },
        },
      } as unknown as TestResultReviewItem;
      const model = buildTestResultPdfModel({
        result: buildResult([diagram]),
        identity,
        source: { kindLabel: 'Test', title: 'Quiz' },
      });
      expect(model.exercises[0]!.groups.find(group => group.heading === 'Student answer')?.lines).toEqual([
        'Nominative: puell',
      ]);
      expect(model.exercises[0]!.groups.find(group => group.heading === 'Expected answer')?.lines).toEqual([
        'Nominative: a',
        'Nominative: a am',
        'Nominative: puella amat',
      ]);
      expectHeadingOrder(model.exercises[0]!, 'Question', 'Expected answer');
      expectHeadingOrder(model.exercises[0]!, 'Expected answer', 'Student answer');
      expect(pdfExerciseText(model.exercises[0]!)).not.toContain('Nominative marks the subject.');
      expect(pdfExerciseText(model.exercises[0]!)).not.toMatch(/explanation/i);
    }
  );

  it('omits lesson page chrome, context, and instruction panels', () => {
    const supporting = {
      id: 'text-1',
      type: 'text',
      title: 'Lesson intro',
      content: 'Supporting passage that belongs to the page, not the exercise.',
    } as TestResultReviewItem;
    const choice: TestResultReviewItem = {
      id: 'ex-choice',
      type: 'multiple-choice',
      title: 'Choose',
      instructions: 'Pick one option.',
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

    const model = buildTestResultPdfModel({
      result: {
        attempt: attempt(),
        review: {
          id: 'attempt-1',
          reviewVersion: 1,
          attemptId: 'attempt-1',
          versionId: 'version-1',
          origin: { kind: 'normal-test', testId: 'test-1' },
          submittedAt,
          content: {
            pages: [{ id: 'page-0', title: 'New Page', items: [supporting, choice] }],
          },
        },
      },
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    });

    const exercise = model.exercises[0]!;
    const text = pdfExerciseText(exercise);
    expect(model.exercises).toHaveLength(1);
    expect(headings(exercise)).not.toContain('Context');
    expect(headings(exercise)).not.toContain('Instructions');
    expect(text).not.toContain('Page:');
    expect(text).not.toContain('New Page');
    expect(text).not.toContain('Lesson intro');
    expect(text).not.toContain('Supporting passage that belongs to the page');
    expect(text).toContain('Pick one option.');
    expect(text).toContain('What is amo?');
    expectHeadingOrder(exercise, 'Question', 'Expected answer');
    expectHeadingOrder(exercise, 'Expected answer', 'Student answer');
  });

  it('records an empty matching attempt when no rounds were saved', () => {
    const matching: TestResultReviewItem = {
      id: 'ex-match-empty',
      type: 'matching',
      title: 'Match the verbs',
      maxPoints: 2,
      studentAnswer: null,
      result: { awardedPoints: 0, maxPoints: 2 },
      question: {
        leftColumn: [{ id: 'left-1', value: 'amo' }],
        rightColumn: [{ id: 'right-1', value: 'I love' }],
        expectedMatchCount: 1,
      },
      answerKey: { pairs: [{ leftId: 'left-1', leftValue: 'amo', rightId: 'right-1', rightValue: 'I love' }] },
      itemResults: { rounds: [] },
    } as unknown as TestResultReviewItem;

    const exercise = buildTestResultPdfModel({
      result: buildResult([matching]),
      identity,
      source: { kindLabel: 'Test', title: 'Quiz' },
    }).exercises[0]!;
    const text = pdfExerciseText(exercise);

    expect(text).toContain('Student answer');
    expect(text).toContain('No answer was recorded.');
    expect(text).toContain(`amo${RESULT_PDF_PAIR_SEPARATOR}I love`);
    expect(text).not.toContain('↔');
    expectHeadingOrder(exercise, 'Expected answer', 'Student answer');
  });
});
