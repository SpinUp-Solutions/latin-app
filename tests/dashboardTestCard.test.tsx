import React from 'react';
import { render, screen } from '@testing-library/react';
import { MockTestCard, TestCard } from '@/src/app/dashboard/page';
import type { StudentTestSummary } from '@/src/types/lesson';
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

describe('student dashboard test card', () => {
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
      id: 'mock-1', title: 'Chapter 4 rehearsal', description: '', passingPercentage: 70, totalPoints: 10,
      attemptSummary: { origin: { kind: 'mock-test', mockTestId: 'mock-1' }, inProgressAttemptId: null, attemptCount: 2, best: { ...result, percentage: 80, outcome: 'passed' }, latest: result },
      scoreTrend: [{ percentage: 60, submittedAt: 'earlier' }, { percentage: 80, submittedAt: 'now' }],
    };
    render(<MockTestCard mock={mock} onMockClick={jest.fn()} />);

    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('2 practice attempts')).toBeInTheDocument();
    expect(screen.getByText('Not passed — informational only')).toBeInTheDocument();
    expect(screen.getByLabelText('Recent scores: 60 percent, 80 percent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retake Mock Test' })).toBeInTheDocument();
  });

  it('keeps a frozen score-only result score-only after a current passing target is added', () => {
    const mock: StudentMockTestSummary = {
      id: 'mock-1', title: 'Chapter 4 rehearsal', description: '', passingPercentage: 70, totalPoints: 10,
      attemptSummary: { origin: { kind: 'mock-test', mockTestId: 'mock-1' }, inProgressAttemptId: null, attemptCount: 1, best: { ...result, outcome: 'score-only' }, latest: { ...result, outcome: 'score-only' } },
      scoreTrend: [],
    };
    render(<MockTestCard mock={mock} onMockClick={jest.fn()} />);

    expect(screen.getByText('Completed — score-only attempt')).toBeInTheDocument();
    expect(screen.queryByText('Not passed — informational only')).not.toBeInTheDocument();
  });

  it('keeps a failed frozen normal result actionable after its current threshold is removed', () => {
    render(<TestCard test={testSummary({ passingPercentage: null, relatedLiveMocks: [{ id: 'mock-1', title: 'Chapter 4 rehearsal', passingPercentage: 70 }] })} onTestClick={jest.fn()} />);

    expect(screen.getByRole('link', { name: /Practice with the Chapter 4 rehearsal Mock Test/i })).toHaveAttribute('href', '/test/mock-1?origin=mock');
  });

  it('uses the same fixed-height footprint as lesson cards', () => {
    const { container } = render(<TestCard test={testSummary()} onTestClick={jest.fn()} />);

    expect(container.firstChild).toHaveClass('h-36');
  });
});
