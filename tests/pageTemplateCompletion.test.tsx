import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PageTemplate from '@/src/components/ui/lesson/page-template';
import type { Page } from '@/src/types/lesson';

jest.mock('@/src/components/ui/lesson/content-renderer', () => ({
  __esModule: true,
  default: ({
    content,
    onComplete,
  }: {
    content: { id: string };
    onComplete?: (score: number) => void;
  }) => (
    <button type="button" onClick={() => onComplete?.(100)}>
      Complete {content.id}
    </button>
  ),
}));

const page = {
  id: 'page-1',
  title: 'Page',
  autoAdvance: { enabled: true, delay: 1000 },
  items: [
    { id: 'exercise-1', type: 'multiple-choice', title: 'One' },
    { id: 'exercise-2', type: 'multiple-choice', title: 'Two' },
  ],
} as unknown as Page;

describe('PageTemplate completion progression', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('tracks multiple terminal completions functionally and auto-advances once', () => {
    const onPageComplete = jest.fn();
    render(<PageTemplate page={page} onPageComplete={onPageComplete} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Complete exercise-1' }));
      fireEvent.click(screen.getByRole('button', { name: 'Complete exercise-2' }));
    });

    expect(onPageComplete).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onPageComplete).toHaveBeenCalledTimes(1);
  });

  it('cleans up a pending auto-advance when the page unmounts', () => {
    const onPageComplete = jest.fn();
    const { unmount } = render(<PageTemplate page={page} onPageComplete={onPageComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Complete exercise-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete exercise-2' }));
    unmount();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onPageComplete).not.toHaveBeenCalled();
  });

  it('forwards exercise onComplete scores through onExerciseComplete for test accounting', () => {
    const onExerciseComplete = jest.fn();
    render(<PageTemplate page={page} onExerciseComplete={onExerciseComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Complete exercise-1' }));
    expect(onExerciseComplete).toHaveBeenCalledWith('exercise-1', 100);
    fireEvent.click(screen.getByRole('button', { name: 'Complete exercise-2' }));
    expect(onExerciseComplete).toHaveBeenCalledWith('exercise-2', 100);
  });
});
