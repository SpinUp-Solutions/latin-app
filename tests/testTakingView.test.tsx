import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestTakingView } from '@/src/components/ui/test/test-taking-view';
import { TestVersionPreview } from '@/src/components/ui/admin/test-version/TestVersionPreview';
import type { Page } from '@/src/types/page';

jest.mock('@/src/components/ui/lesson/page-template', () => ({
  PageTemplate: ({
    page,
    runtimeMode,
    answers,
    onAnswer,
    onExerciseComplete,
  }: {
    page: Page;
    runtimeMode: string;
    answers?: Record<string, { type: string; selectedOptionIds?: string[] }>;
    onAnswer?: (event: {
      exerciseId: string;
      answer: { type: 'multiple-choice'; selectedOptionIds: string[] };
    }) => void;
    onExerciseComplete?: (exerciseId: string, score: number) => void;
  }) => {
    const exerciseId = page.items[0]?.id;
    const restored = exerciseId ? answers?.[exerciseId]?.selectedOptionIds?.join(',') : undefined;
    return (
      <div>
        <span>
          {page.id}:{runtimeMode}
        </span>
        <span data-testid={`restored-${page.id}`}>{restored || 'empty'}</span>
        {exerciseId && (
          <button
            onClick={() => {
              onAnswer?.({
                exerciseId,
                answer: { type: 'multiple-choice', selectedOptionIds: [`answer-${exerciseId}`] },
              });
              onExerciseComplete?.(exerciseId, 0);
            }}>
            Answer {exerciseId}
          </button>
        )}
      </div>
    );
  },
}));

const pages = [
  {
    id: 'page-one',
    title: 'First page',
    items: [{ id: 'question-one', type: 'multiple-choice' }],
  },
  {
    id: 'page-two',
    title: 'Second page',
    items: [{ id: 'question-two', type: 'multiple-choice' }],
  },
] as Page[];

describe('shared Roman test-taking view', () => {
  it('renders the controlled student shell and delegates navigation', () => {
    const onNext = jest.fn();
    render(
      <TestTakingView
        title="Roman assessment"
        description="Assessment description"
        pages={pages}
        currentPageIndex={0}
        answeredCount={1}
        totalExercises={2}
        status="Answer saved."
        onPrevious={jest.fn()}
        onNext={onNext}
        onReview={jest.fn()}
      />
    );

    expect(screen.getByTestId('test-taking-view')).toHaveClass('bg-roman-marble');
    expect(screen.getByText('Roman assessment')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
    expect(screen.getByText('page-one:test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keeps local preview answers across pages and resets them when authored pages change', async () => {
    const { rerender } = render(
      <TestVersionPreview title="Preview assessment" description="Preview description" pages={pages} />
    );

    expect(screen.getByText('page-one:test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Answer question-one' }));
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Answer question-two' }));
    expect(screen.getByText('2 of 2 answered')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    expect(screen.getByRole('status')).toHaveTextContent('Review and submission are unavailable in preview');

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByTestId('restored-page-one')).toHaveTextContent('answer-question-one');

    const changedPages = [{ ...pages[0], title: 'Updated first page' }, pages[1]];
    rerender(<TestVersionPreview title="Preview assessment" description="Preview description" pages={changedPages} />);

    await waitFor(() => expect(screen.getByText('0 of 2 answered')).toBeInTheDocument());
    expect(screen.getByText('page-one:test')).toBeInTheDocument();
    expect(screen.getByTestId('restored-page-one')).toHaveTextContent('empty');
    expect(screen.getByRole('status')).toHaveTextContent('Preview mode — answers are not saved.');
  });
});
