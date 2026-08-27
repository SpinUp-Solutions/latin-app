import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LessonCard, MockTestCard, TestCard } from '@/src/app/dashboard/page';
import type { StudentLessonSummary, StudentTestSummary } from '@/src/types/lesson';
import type { StudentMockTestSummary } from '@/src/types/test';

jest.mock('swiper/react', () => ({
  Swiper: ({ children }: { children: React.ReactNode }) => children,
  SwiperSlide: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('swiper/css', () => ({}));

const result = {
  attemptId: 'attempt-1',
  score: 6,
  maxScore: 10,
  percentage: 60,
  outcome: 'not-passed' as const,
  submittedAt: 'now',
};

const testSummary = (overrides: Partial<StudentTestSummary> = {}): StudentTestSummary => ({
  id: 'test-1',
  kind: 'test',
  title: 'Chapter test',
  description: '',
  passingPercentage: 70,
  rotationVersionCount: 1,
  minTotalPoints: 10,
  maxTotalPoints: 10,
  status: 'available',
  attemptSummary: {
    origin: { kind: 'normal-test', testId: 'test-1' },
    inProgressAttemptId: null,
    attemptCount: 1,
    best: result,
    latest: result,
  },
  ...overrides,
});

const lessonSummary = (overrides: Partial<StudentLessonSummary> = {}): StudentLessonSummary => ({
  id: 'lesson-1',
  kind: 'lesson',
  title: 'Latin foundations',
  description: '',
  type: 'normal',
  isLive: true,
  liveOrder: 1,
  publishedAt: 'now',
  publishedBy: 'teacher-1',
  totalPages: 3,
  totalItems: 3,
  totalExercises: 1,
  status: 'in-progress',
  progress: 35,
  furthestPageIndex: 0,
  currentPageIndex: 0,
  exerciseProgress: [],
  ...overrides,
});

describe('student dashboard test card', () => {
  it('uses the production lesson-card presentation while retaining the accessible action', () => {
    const { container } = render(<LessonCard lesson={lessonSummary()} onLessonClick={jest.fn()} />);

    expect(container.firstChild).toHaveClass('h-36');
    expect(screen.queryByText('Lesson')).not.toBeInTheDocument();
    expect(screen.queryByText('Continue from where you left off.')).not.toBeInTheDocument();
    expect(screen.queryByText('35% complete')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue lesson' })).toBeInTheDocument();
  });

  it('communicates an unsuccessful required-pass result and retake gate', () => {
    render(<TestCard test={testSummary()} onTestClick={jest.fn()} />);

    expect(screen.getByText('Latest: Not passed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retake Test' })).toBeInTheDocument();
  });

  it('distinguishes a failed latest retake from retained sticky completion', () => {
    render(<TestCard test={testSummary({ status: 'completed' })} onTestClick={jest.fn()} />);

    expect(screen.getByText('Latest: Not passed · completion retained')).toBeInTheDocument();
  });

  it('makes mock scores, attempt history, and informational passing status accessible', () => {
    const mock: StudentMockTestSummary = {
      id: 'mock-1',
      title: 'Chapter 4 rehearsal',
      description: '',
      passingPercentage: 70,
      totalPoints: 10,
      attemptSummary: {
        origin: { kind: 'mock-test', mockTestId: 'mock-1' },
        inProgressAttemptId: null,
        attemptCount: 2,
        best: { ...result, percentage: 80, outcome: 'passed' },
        latest: result,
      },
      scoreTrend: [
        { percentage: 60, submittedAt: 'earlier' },
        { percentage: 80, submittedAt: 'now' },
      ],
    };
    render(<MockTestCard mock={mock} onMockClick={jest.fn()} />);

    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('2 practice attempts')).toBeInTheDocument();
    expect(screen.getByText('Not passed — informational only')).toBeInTheDocument();
    expect(screen.getByLabelText('Recent scores: 60 percent, 80 percent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retake Mock Test: Chapter 4 rehearsal' })).toBeInTheDocument();
  });

  it('makes the whole mock test card actionable', () => {
    const onMockClick = jest.fn();
    const mock: StudentMockTestSummary = {
      id: 'mock-1',
      title: 'Chapter 4 rehearsal',
      description: '',
      passingPercentage: 70,
      totalPoints: 10,
      attemptSummary: {
        origin: { kind: 'mock-test', mockTestId: 'mock-1' },
        inProgressAttemptId: null,
        attemptCount: 0,
        best: null,
        latest: null,
      },
      scoreTrend: [],
    };

    render(<MockTestCard mock={mock} onMockClick={onMockClick} />);

    fireEvent.click(screen.getByText('Chapter 4 rehearsal'));

    expect(onMockClick).toHaveBeenCalledWith('mock-1');
  });

  it('keeps a frozen score-only result score-only after a current passing target is added', () => {
    const mock: StudentMockTestSummary = {
      id: 'mock-1',
      title: 'Chapter 4 rehearsal',
      description: '',
      passingPercentage: 70,
      totalPoints: 10,
      attemptSummary: {
        origin: { kind: 'mock-test', mockTestId: 'mock-1' },
        inProgressAttemptId: null,
        attemptCount: 1,
        best: { ...result, outcome: 'score-only' },
        latest: { ...result, outcome: 'score-only' },
      },
      scoreTrend: [],
    };
    render(<MockTestCard mock={mock} onMockClick={jest.fn()} />);

    expect(screen.getByText('Completed — score-only attempt')).toBeInTheDocument();
    expect(screen.queryByText('Not passed — informational only')).not.toBeInTheDocument();
  });

  it('keeps a failed frozen normal result actionable after its current threshold is removed', () => {
    render(
      <TestCard
        test={testSummary({
          passingPercentage: null,
          relatedLiveMocks: [{ id: 'mock-1', title: 'Chapter 4 rehearsal', passingPercentage: 70 }],
        })}
        onTestClick={jest.fn()}
      />
    );

    expect(screen.getByRole('link', { name: /Practice with the Chapter 4 rehearsal Mock Test/i })).toHaveAttribute(
      'href',
      '/test/mock-1?origin=mock'
    );
  });

  it('uses the shared fixed-height learning-unit footprint', () => {
    const { container } = render(<TestCard test={testSummary()} onTestClick={jest.fn()} />);

    expect(container.firstChild).toHaveClass('h-40');
    expect(screen.getByText('Review test')).toBeInTheDocument();
  });

  it('links to the latest submitted review from the test card', () => {
    render(<TestCard test={testSummary()} onTestClick={jest.fn()} />);

    expect(screen.getByTestId('test-review-latest-link')).toHaveAttribute('href', '/test-results/attempt-1');
    expect(screen.getByText('Review latest result')).toBeInTheDocument();
  });

  it('omits the review link while no attempt has been submitted', () => {
    render(
      <TestCard
        test={testSummary({
          attemptSummary: {
            origin: { kind: 'normal-test', testId: 'test-1' },
            inProgressAttemptId: 'attempt-2',
            attemptCount: 0,
            best: null,
            latest: null,
          },
        })}
        onTestClick={jest.fn()}
      />
    );

    expect(screen.queryByTestId('test-review-latest-link')).not.toBeInTheDocument();
  });

  it('opens the latest mock review without retaking the mock', () => {
    const onMockClick = jest.fn();
    const mock: StudentMockTestSummary = {
      id: 'mock-1',
      title: 'Chapter 4 rehearsal',
      description: '',
      passingPercentage: 70,
      totalPoints: 10,
      attemptSummary: {
        origin: { kind: 'mock-test', mockTestId: 'mock-1' },
        inProgressAttemptId: null,
        attemptCount: 1,
        best: result,
        latest: result,
      },
      scoreTrend: [],
    };
    render(<MockTestCard mock={mock} onMockClick={onMockClick} />);

    const reviewLink = screen.getByTestId('mock-review-latest-link');
    expect(reviewLink).toBeInTheDocument();
    expect(reviewLink).toHaveAttribute('href', '/test-results/attempt-1');
    expect(screen.getByRole('button', { name: 'Retake Mock Test: Chapter 4 rehearsal' })).not.toContainElement(
      reviewLink
    );
    fireEvent.click(reviewLink);
    expect(onMockClick).not.toHaveBeenCalled();
  });
});
