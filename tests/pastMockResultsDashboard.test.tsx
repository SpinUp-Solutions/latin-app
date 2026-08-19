import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PracticeSection } from '@/src/components/ui/core/PracticeSection';
import type { StudentPastMockResult } from '@/src/types/test-results';

const pastMock: StudentPastMockResult = {
  id: 'hidden-mock',
  title: 'Archived rehearsal',
  description: 'No longer live',
  passingPercentage: 70,
  latest: {
    attemptId: 'attempt-hidden',
    score: 6,
    maxScore: 10,
    percentage: 60,
    outcome: 'not-passed',
    submittedAt: '2026-08-19T12:00:00.000Z',
  },
};

describe('past mock results on the practice dashboard', () => {
  it('retains a small review-only entry for hidden or archived mocks', () => {
    const onReviewResultClick = jest.fn();
    render(
      <PracticeSection
        lessons={[]}
        onLessonClick={jest.fn()}
        mockTests={[]}
        pastMockResults={[pastMock]}
        onReviewResultClick={onReviewResultClick}
      />
    );

    // The Mock Tests tab is the only collection with content.
    fireEvent.click(screen.getByRole('tab', { name: /Mock Tests/ }));

    const entry = screen.getByTestId('past-mock-result-hidden-mock');
    expect(entry).toBeInTheDocument();
    expect(entry).toHaveTextContent('Archived rehearsal');
    expect(entry).toHaveTextContent('60%');
    expect(entry).toHaveTextContent('not passed');

    const reviewLink = withinEntry(entry).getByText('Review result');
    expect(reviewLink).toHaveAttribute('href', '/test-results/attempt-hidden');
  });

  it('never offers a retake for a past mock result', () => {
    render(
      <PracticeSection
        lessons={[]}
        onLessonClick={jest.fn()}
        mockTests={[]}
        pastMockResults={[pastMock]}
        onReviewResultClick={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /Mock Tests/ }));

    expect(screen.queryByText(/Retake Mock Test/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Start Mock Test/)).not.toBeInTheDocument();
  });
});

const withinEntry = (entry: HTMLElement) => ({
  getByText: (text: string) => {
    const matches = Array.from(entry.querySelectorAll('*')).filter(element => element.textContent === text);
    if (matches.length !== 1) throw new Error(`Expected exactly one "${text}" inside the entry`);
    return matches[0];
  },
});
