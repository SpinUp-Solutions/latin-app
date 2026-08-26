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
  it('derives the bar solely from the current page', () => {
    const { container } = render(<LessonNavigation {...baseProps} currentPageIndex={1} />);
    expect(container.querySelector('[style="width: 67%;"]')).toBeInTheDocument();
  });

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

  it('disables Finish while its request is in flight or required exercises are missing', () => {
    const { rerender } = render(<LessonNavigation {...baseProps} currentPageIndex={2} isFinishing />);
    expect(screen.getByRole('button', { name: /finishing/i })).toBeDisabled();

    rerender(<LessonNavigation {...baseProps} currentPageIndex={2} isFinishing={false} isFinishBlocked />);
    expect(screen.getByRole('button', { name: /finish lesson/i })).toBeDisabled();

    rerender(<LessonNavigation {...baseProps} currentPageIndex={2} isFinishBlocked={false} />);
    expect(screen.getByRole('button', { name: /finish lesson/i })).toBeEnabled();
  });

  it('shows Lesson Complete and keeps previous plus page jump usable', () => {
    render(<LessonNavigation {...baseProps} currentPageIndex={2} isLessonCompleted />);
    const completeButton = screen.getByRole('button', { name: /lesson complete/i });
    expect(completeButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /prev/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /page 3 \/ 3/i }));
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(baseProps.onGoToPage).toHaveBeenCalledWith(0);
    fireEvent.click(completeButton);
    expect(baseProps.onFinish).not.toHaveBeenCalled();
  });
});
