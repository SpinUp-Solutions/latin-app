import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TestResultReviewView } from '@/src/components/ui/test-results/test-result-review';
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
  exerciseResults: {},
  score: 23,
  maxScore: 40,
  percentage: 57.5,
  outcome: 'not-passed',
  submittedAt,
  ...overrides,
});

const fillItem = (
  id: string,
  options: {
    awardedPoints: number;
    correctFirst: boolean;
    correctSecond?: boolean;
    withAudio?: boolean;
    withExplanation?: boolean;
  }
): TestResultReviewItem => {
  const correctSecond = options.correctSecond ?? options.correctFirst;
  return {
    id,
    type: 'fill',
    title: `Fill ${id}`,
    instructions: '',
    maxPoints: 10,
    studentAnswer: {
      type: 'fill',
      answers: [options.correctFirst ? 'love' : 'wrong', correctSecond ? 'walk' : 'wrong'],
    },
    result: { awardedPoints: options.awardedPoints, maxPoints: 10 },
    audioPath: options.withAudio ? 'audio/fill.mp3' : null,
    question: { items: [{ text: 'amo' }, { text: 'ambulo' }] },
    answerKey: {
      items: [
        {
          text: 'amo',
          acceptedAnswers: ['love'],
          ...(options.withExplanation ? { explanation: 'Because amo is a verb of loving' } : {}),
        },
        { text: 'ambulo', acceptedAnswers: ['walk'] },
      ],
    },
    itemResults: {
      answers: [
        {
          value: options.correctFirst ? 'love' : 'wrong',
          correct: options.correctFirst,
          points: { awardedPoints: options.correctFirst ? 5 : 0, maxPoints: 5 },
        },
        {
          value: correctSecond ? 'walk' : 'wrong',
          correct: correctSecond,
          points: { awardedPoints: correctSecond ? 5 : 0, maxPoints: 5 },
        },
      ],
    },
  } as TestResultReviewItem;
};

const diagramItem = (): TestResultReviewItem =>
  ({
    id: 'ex-diagram',
    type: 'sentence-diagramming',
    title: 'Diagram the sentence',
    instructions: '',
    maxPoints: 10,
    studentAnswer: { type: 'sentence-diagramming', annotations: [] },
    result: { awardedPoints: 10, maxPoints: 10 },
    question: {
      latin: 'amo',
      translation: 'I love',
      tokens: [{ id: 't1', text: 'amo', index: 0 }],
      availableStudentTools: ['verb'],
      difficulty: 'beginner',
    },
    answerKey: {
      latin: 'amo',
      translation: 'I love',
      tokens: [{ id: 't1', text: 'amo', index: 0 }],
      solutionAnnotations: [],
    },
    itemResults: {
      annotations: [],
      accuracy: 100,
      correct: true,
      points: { awardedPoints: 10, maxPoints: 10 },
    },
  }) as unknown as TestResultReviewItem;

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

const listeningItem = (): TestResultReviewItem =>
  ({
    id: 'listen-1',
    type: 'listening-passage',
    title: 'Passage',
    data: { latinText: 'amo et ambulo', translation: 'I love and I walk', passageAudioPath: 'audio/passage.mp3' },
  }) as TestResultReviewItem;

const buildResult = (
  items: TestResultReviewItem[][],
  pageOverrides: Array<{ audioPath?: string; title?: string }> = []
): StudentTestResult => ({
  attempt: attempt(),
  review: {
    id: 'attempt-1',
    reviewVersion: 1,
    attemptId: 'attempt-1',
    versionId: 'version-1',
    origin: { kind: 'normal-test', testId: 'test-1' },
    submittedAt,
    content: {
      pages: items.map((pageItems, index) => ({
        id: `page-${index}`,
        title: `Page ${index + 1}`,
        ...pageOverrides[index],
        items: pageItems,
      })),
    },
  },
});

describe('submitted test result review view', () => {
  it('opens the first incorrect or partly correct exercise by default', () => {
    render(
      <TestResultReviewView
        result={buildResult([
          [fillItem('ex-fill-1', { awardedPoints: 10, correctFirst: true })],
          [fillItem('ex-fill-2', { awardedPoints: 5, correctFirst: false, correctSecond: true })],
          [diagramItem()],
        ])}
      />
    );

    const triggers = screen.getAllByRole('button', { name: /^Exercise \d+:/ });
    expect(triggers).toHaveLength(3);
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'false');
    expect(triggers[1]).toHaveAttribute('aria-expanded', 'true');
    expect(triggers[2]).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the first exercise when every exercise is correct', () => {
    render(
      <TestResultReviewView
        result={buildResult([[fillItem('ex-fill-1', { awardedPoints: 10, correctFirst: true })], [diagramItem()]])}
      />
    );

    const triggers = screen.getAllByRole('button', { name: /^Exercise \d+:/ });
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'true');
    expect(triggers[1]).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps exactly one accordion item open at a time', () => {
    render(
      <TestResultReviewView
        result={buildResult([
          [fillItem('ex-fill-1', { awardedPoints: 10, correctFirst: true })],
          [fillItem('ex-fill-2', { awardedPoints: 5, correctFirst: false, correctSecond: true })],
          [diagramItem()],
        ])}
      />
    );

    const triggers = screen.getAllByRole('button', { name: /^Exercise \d+:/ });
    expect(triggers.filter(trigger => trigger.getAttribute('aria-expanded') === 'true')).toHaveLength(1);

    fireEvent.click(triggers[2]);
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'false');
    expect(triggers[1]).toHaveAttribute('aria-expanded', 'false');
    expect(triggers[2]).toHaveAttribute('aria-expanded', 'true');
    expect(triggers.filter(trigger => trigger.getAttribute('aria-expanded') === 'true')).toHaveLength(1);

    // A single (non-collapsible) accordion never allows zero open items.
    fireEvent.click(triggers[2]);
    expect(triggers[2]).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows per-part marks, accepted answers, and teacher explanations', () => {
    render(
      <TestResultReviewView
        result={buildResult([
          [
            fillItem('ex-fill-1', {
              awardedPoints: 5,
              correctFirst: true,
              correctSecond: false,
              withExplanation: true,
            }),
          ],
        ])}
      />
    );

    expect(screen.getByText('Because amo is a verb of loving')).toBeInTheDocument();
    expect(screen.getAllByText('love')).toHaveLength(2);
    expect(screen.getByText('walk')).toBeInTheDocument();
    expect(screen.getByText('wrong')).toBeInTheDocument();
    expect(screen.getAllByText('Accepted answer:')).toHaveLength(2);
    expect(screen.getByText('5 / 10 points')).toBeInTheDocument();
    expect(screen.getByText('5 / 5 points')).toBeInTheDocument();
    expect(screen.getByText('0 / 5 points')).toBeInTheDocument();
  });

  it('renders playable audio for supporting passages and exercises', () => {
    const { container } = render(
      <TestResultReviewView
        result={buildResult(
          [[listeningItem(), fillItem('ex-fill-1', { awardedPoints: 10, correctFirst: true, withAudio: true })]],
          [{ audioPath: 'audio/page.mp3' }]
        )}
      />
    );

    expect(container.querySelectorAll('audio')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(3);
    expect(screen.getByTestId('review-page-audio-page-0')).toBeInTheDocument();
  });

  it('keeps supporting-only pages with the next reviewable exercise', () => {
    render(
      <TestResultReviewView
        result={buildResult([[listeningItem()], [fillItem('ex-fill-1', { awardedPoints: 10, correctFirst: true })]])}
      />
    );

    expect(screen.getByText('amo et ambulo')).toBeInTheDocument();
    expect(screen.getByText('I love and I walk')).toBeInTheDocument();
  });

  it('stacks diagrams on small screens and places them side by side on large screens', () => {
    render(
      <TestResultReviewView
        result={buildResult([
          [diagramItem(), fillItem('ex-fill-2', { awardedPoints: 5, correctFirst: false, correctSecond: true })],
        ])}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Exercise 1: Diagram the sentence/ }));
    const comparison = screen.getByTestId('diagram-review-comparison');
    expect(comparison.className).toContain('grid-cols-1');
    expect(comparison.className).toContain('lg:grid-cols-2');
    expect(within(comparison).getByText('Your diagram')).toBeInTheDocument();
    expect(within(comparison).getByText('Correct diagram')).toBeInTheDocument();
    expect(screen.getByText('100% of annotations matched.')).toBeInTheDocument();
  });

  it('labels and displays points for a partly correct exercise', () => {
    const partialDiagram = diagramItem() as Extract<TestResultReviewItem, { type: 'sentence-diagramming' }>;
    partialDiagram.result = { awardedPoints: 5, maxPoints: 10 };
    partialDiagram.itemResults = {
      ...partialDiagram.itemResults,
      accuracy: 50,
      correct: false,
      points: { awardedPoints: 5, maxPoints: 10 },
    };

    render(<TestResultReviewView result={buildResult([[partialDiagram]])} />);

    expect(screen.getByText('Partly correct')).toBeInTheDocument();
    expect(screen.getAllByText('5 / 10 points')).toHaveLength(2);
  });

  it('shows translation text, a score out of 10, and the saved AI feedback', () => {
    render(
      <TestResultReviewView
        result={buildResult([
          [translationItem(), fillItem('ex-fill-2', { awardedPoints: 5, correctFirst: false, correctSecond: true })],
        ])}
      />
    );

    expect(screen.getByText('I love walking')).toBeInTheDocument();
    expect(screen.getByText('8 / 10')).toBeInTheDocument();
    expect(screen.getByText('Very close, but check the conjunction.')).toBeInTheDocument();
    expect(screen.getByText('AI feedback')).toBeInTheDocument();
  });

  it('renders student text and AI feedback as escaped text rather than executable HTML', () => {
    const translation = translationItem() as Extract<TestResultReviewItem, { type: 'translation-grading' }>;
    translation.itemResults.items[0] = {
      ...translation.itemResults.items[0],
      translation: '<img src=x alt="student-payload">',
      feedback: '<img src=x alt="ai-payload">',
    };

    render(<TestResultReviewView result={buildResult([[translation]])} />);

    expect(screen.queryByAltText('student-payload')).not.toBeInTheDocument();
    expect(screen.queryByAltText('ai-payload')).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x alt="student-payload">')).toBeInTheDocument();
    expect(screen.getByText('<img src=x alt="ai-payload">')).toBeInTheDocument();
  });

  it('keeps the frozen summary working when no detailed review exists', () => {
    render(<TestResultReviewView result={{ attempt: attempt(), review: null }} />);

    expect(screen.getByText('57.5%')).toBeInTheDocument();
    expect(screen.getByText('23 / 40 points')).toBeInTheDocument();
    expect(screen.getByText('Detailed review unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('test-result-accordion')).not.toBeInTheDocument();
  });
});
