import { fireEvent, render, screen } from '@testing-library/react';
import LessonNavigation from '@/src/components/ui/exercises/lesson-navigation';

const baseProps = {
  totalPages: 3,
  pageTitles: ['One', 'Two', 'Three'],
  onPrevious: jest.fn(),
  onNext: jest.fn(),
  onFinish: jest.fn(),
  onGoToPage: jest.fn(),
  onTogglePlay: jest.fn(),
  isPlaying: false,
  hasAudio: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LessonNavigation completion action', () => {
  it('uses Next before the final page', () => {
    render(<LessonNavigation {...baseProps} currentPageIndex={1} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(baseProps.onNext).toHaveBeenCalledTimes(1);
    expect(baseProps.onFinish).not.toHaveBeenCalled();
  });

  it('replaces the final disabled Next button with Finish Lesson', () => {
    render(<LessonNavigation {...baseProps} currentPageIndex={2} />);
    const finishButton = screen.getByRole('button', { name: /finish lesson/i });

    expect(finishButton).toBeEnabled();
    fireEvent.click(finishButton);
    expect(baseProps.onFinish).toHaveBeenCalledTimes(1);
  });

  it('only disables Finish while its request is in flight', () => {
    const { rerender } = render(<LessonNavigation {...baseProps} currentPageIndex={2} isFinishing />);
    expect(screen.getByRole('button', { name: /finishing/i })).toBeDisabled();

    rerender(<LessonNavigation {...baseProps} currentPageIndex={2} isFinishing={false} />);
    expect(screen.getByRole('button', { name: /finish lesson/i })).toBeEnabled();
  });
});
