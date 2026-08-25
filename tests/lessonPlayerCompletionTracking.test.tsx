import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LessonPlayer } from '@/src/components/ui/lesson/lesson-player';
import type { LessonWithProgress } from '@/src/types/lesson';
import {
  useFinishLessonMutation,
  useMarkExerciseCompleteMutation,
  useUpdatePageProgressMutation,
} from '@/src/store/api/lessonApi';
import { toast } from 'sonner';
import { captureException, captureMessage } from '@sentry/nextjs';

let audioEndedHandler: (() => void) | undefined;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const mockMarkExerciseComplete = jest.fn();
const mockUpdatePageProgress = jest.fn();
const mockFinishLesson = jest.fn();

jest.mock('@/src/store/api/lessonApi', () => ({
  useMarkExerciseCompleteMutation: jest.fn(),
  useUpdatePageProgressMutation: jest.fn(),
  useFinishLessonMutation: jest.fn(),
}));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'student-1' } }),
}));

jest.mock('@/src/hooks/useAudio', () => ({
  __esModule: true,
  default: (_src: unknown, onEnded?: () => void) => {
    audioEndedHandler = onEnded;
    return { audioRef: { current: null }, isPlaying: false, togglePlay: jest.fn() };
  },
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

jest.mock('@/src/components/ui/lesson/page-template', () => ({
  __esModule: true,
  default: ({
    page,
    onCompletionAccepted,
  }: {
    page: { id: string };
    onCompletionAccepted?: (exerciseId: string, score: number) => void;
  }) => (
    <div>
      <span>Page content: {page.id}</span>
      <button type="button" onClick={() => onCompletionAccepted?.('exercise-1', 100)}>
        Accept exercise
      </button>
    </div>
  ),
}));

jest.mock('@/src/components/ui/exercises/lesson-navigation', () => ({
  __esModule: true,
  default: ({
    currentPageIndex,
    totalPages,
    isLessonCompleted,
    onPrevious,
    onNext,
    onFinish,
    isFinishing,
  }: {
    currentPageIndex: number;
    totalPages: number;
    isLessonCompleted?: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onFinish: () => void;
    isFinishing?: boolean;
  }) => {
    const canGoNext = currentPageIndex < totalPages - 1;
    const progressPercentage = Math.round(((currentPageIndex + 1) / totalPages) * 100);
    const label = canGoNext
      ? 'Next page'
      : isFinishing
        ? 'Finishing…'
        : isLessonCompleted
          ? 'Lesson Complete'
          : 'Finish lesson';
    return (
      <nav>
        <span>Progress {progressPercentage}%</span>
        <button type="button" onClick={onPrevious}>
          Previous page
        </button>
        <button type="button" onClick={canGoNext ? onNext : onFinish} disabled={!canGoNext && (Boolean(isFinishing) || Boolean(isLessonCompleted))}>
          {label}
        </button>
      </nav>
    );
  },
}));

const createLesson = (
  pageCount = 1,
  overrides: Partial<LessonWithProgress> & { pageItems?: Array<Array<{ id: string; type: string; title?: string }>> } = {}
) => {
  const { pageItems, ...lessonOverrides } = overrides;
  return {
    id: 'lesson-1',
    title: 'Tracked lesson',
    type: 'normal',
    pages: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${index + 1}`,
      items: pageItems?.[index] ?? [{ id: 'exercise-1', type: 'fill', title: 'Exercise' }],
    })),
    isLive: false,
    liveOrder: null,
    publishedAt: null,
    publishedBy: null,
    ...lessonOverrides,
  } as unknown as LessonWithProgress;
};

type MutationSummary = {
  success: boolean;
  furthestPageIndex?: number;
  lessonCompleted?: boolean;
  progress?: number;
  completedExerciseCount?: number;
  requiredExerciseCount?: number;
};

let markWrites: Array<Deferred<MutationSummary>>;
let finishWrite: Deferred<MutationSummary>;
let pageWrites: Array<Deferred<MutationSummary>>;

beforeEach(() => {
  jest.clearAllMocks();
  audioEndedHandler = undefined;
  markWrites = [];
  pageWrites = [];
  finishWrite = createDeferred();

  jest.mocked(useMarkExerciseCompleteMutation).mockReturnValue([mockMarkExerciseComplete] as never);
  jest.mocked(useUpdatePageProgressMutation).mockReturnValue([mockUpdatePageProgress] as never);
  jest.mocked(useFinishLessonMutation).mockReturnValue([mockFinishLesson, { isLoading: false }] as never);

  mockUpdatePageProgress.mockImplementation(() => {
    const write = createDeferred<MutationSummary>();
    pageWrites.push(write);
    return { unwrap: () => write.promise };
  });
  mockMarkExerciseComplete.mockImplementation(() => {
    const write = createDeferred<MutationSummary>();
    markWrites.push(write);
    return { unwrap: () => write.promise };
  });
  mockFinishLesson.mockReturnValue({ unwrap: () => finishWrite.promise });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LessonPlayer accepted completion tracking', () => {
  it('renders a noninteractive ring from server counts and applies successful updates', async () => {
    render(
      <LessonPlayer
        lesson={createLesson(2, {
          status: 'in-progress',
          completedExerciseCount: 1,
          requiredExerciseCount: 2,
        })}
      />
    );

    const ring = screen.getByRole('progressbar', { name: /exercise progress/i });
    expect(ring).toHaveAttribute('aria-valuemin', '0');
    expect(ring).toHaveAttribute('aria-valuemax', '2');
    expect(ring).toHaveAttribute('aria-valuenow', '1');
    expect(ring).toHaveTextContent('1/2');
    expect(ring.querySelector('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    await act(async () => {
      markWrites[0].resolve({
        success: true,
        lessonCompleted: true,
        completedExerciseCount: 2,
        requiredExerciseCount: 2,
      });
    });

    expect(screen.getByRole('progressbar', { name: /exercise progress/i })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByRole('progressbar').querySelector('.stroke-roman-green')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('button', { name: /lesson complete/i })).toBeDisabled();
  });

  it('keeps a partial ring when completion status is true but server counts are partial', async () => {
    render(
      <LessonPlayer
        lesson={createLesson(1, {
          status: 'completed',
          completedExerciseCount: 1,
          requiredExerciseCount: 2,
        })}
      />
    );

    await act(async () => {
      pageWrites[0].resolve({
        success: true,
        lessonCompleted: true,
        completedExerciseCount: 1,
        requiredExerciseCount: 2,
      });
    });

    expect(screen.getByRole('progressbar', { name: /exercise progress/i })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lesson complete/i })).toBeDisabled();
  });

  it.each([
    ['passive', { lesson: { pageItems: [[{ id: 'text-1', type: 'text', title: 'Read' }]] }, player: {} }],
    ['preview', { lesson: {}, player: { runtimeMode: 'preview' as const } }],
    ['untracked', { lesson: {}, player: { trackProgress: false } }],
    ['test', { lesson: {}, player: { runtimeMode: 'test' as const } }],
  ])('hides the ring for %s lessons', (_label, { lesson: lessonProps, player: playerProps }) => {
    render(<LessonPlayer lesson={createLesson(1, lessonProps)} {...playerProps} />);
    expect(screen.queryByRole('progressbar', { name: /exercise progress/i })).not.toBeInTheDocument();
  });

  it('starts persistence before immediate navigation and survives exercise unmount', async () => {
    const { unmount } = render(<LessonPlayer lesson={createLesson(2)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    expect(mockMarkExerciseComplete).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page content: page-2')).toBeInTheDocument();

    unmount();
    await act(async () => {
      markWrites[0].resolve({ success: true });
    });
  });

  it('waits for accepted exercise writes before finishing and ignores concurrent finishes', async () => {
    render(<LessonPlayer lesson={createLesson()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    const finishButton = screen.getByRole('button', { name: 'Finish lesson' });
    fireEvent.click(finishButton);
    fireEvent.click(finishButton);

    expect(mockFinishLesson).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /finishing/i })).toBeDisabled();

    await act(async () => {
      markWrites[0].resolve({ success: true });
    });

    await waitFor(() => expect(mockFinishLesson).toHaveBeenCalledTimes(1));
    expect(mockFinishLesson).toHaveBeenCalledWith({
      userId: 'student-1',
      lessonId: 'lesson-1',
      finalPageId: 'page-1',
    });

    await act(async () => {
      finishWrite.resolve({ success: true });
    });
  });

  it('drains rejected exercise writes without preventing Finish', async () => {
    render(<LessonPlayer lesson={createLesson()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish lesson' }));

    await act(async () => {
      markWrites[0].reject(new Error('write failed'));
    });

    await waitFor(() => expect(mockFinishLesson).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith('write failed');

    await act(async () => {
      finishWrite.resolve({ success: true });
    });
  });

  it('keeps exercise retries in the pending pipeline before Finish and reports only the final failure', async () => {
    jest.useFakeTimers();
    render(<LessonPlayer lesson={createLesson()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish lesson' }));
    await act(async () => {
      markWrites[0].reject({ status: 500 });
    });
    expect(mockFinishLesson).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(markWrites).toHaveLength(2);
    await act(async () => {
      markWrites[1].reject({ status: 500 });
    });
    expect(mockFinishLesson).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(markWrites).toHaveLength(3);
    await act(async () => {
      markWrites[2].reject({ status: 500 });
    });
    await waitFor(() => expect(mockFinishLesson).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith('Unable to save your exercise progress. Please try again.');

    await act(async () => {
      finishWrite.resolve({ success: true });
    });
    jest.useRealTimers();
  });
});

describe('LessonPlayer mutation summaries and retries', () => {
  it('updates the exercise ring monotonically from successful mutation summaries', async () => {
    render(
      <LessonPlayer
        lesson={createLesson(2, {
          progress: 0,
          status: 'in-progress',
          completedExerciseCount: 0,
          requiredExerciseCount: 2,
        })}
      />
    );

    await act(async () => {
      pageWrites[0].resolve({ success: true, progress: 0, lessonCompleted: false });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    await act(async () => {
      markWrites[0].resolve({
        success: true,
        progress: 50,
        lessonCompleted: false,
        completedExerciseCount: 1,
        requiredExerciseCount: 2,
      });
    });
    expect(screen.getByRole('progressbar', { name: /exercise progress/i })).toHaveAttribute('aria-valuenow', '1');

    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    await act(async () => {
      markWrites[1].resolve({
        success: true,
        progress: 33,
        lessonCompleted: false,
        completedExerciseCount: 0,
        requiredExerciseCount: 2,
      });
    });
    expect(screen.getByRole('progressbar', { name: /exercise progress/i })).toHaveAttribute('aria-valuenow', '1');
  });

  it('does not complete locally after a failed final-page visit, then completes on retry success', async () => {
    jest.useFakeTimers();
    render(<LessonPlayer lesson={createLesson(1, { progress: 0, status: 'in-progress' })} />);

    await act(async () => {
      pageWrites[0].reject({ status: 500 });
    });
    expect(screen.getByRole('button', { name: 'Finish lesson' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /lesson complete/i })).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(pageWrites).toHaveLength(2);
    await act(async () => {
      pageWrites[1].resolve({ success: true, progress: 100, lessonCompleted: true, furthestPageIndex: 0 });
    });
    expect(screen.getByRole('button', { name: /lesson complete/i })).toBeDisabled();
    jest.useRealTimers();
  });

  it('uses both bounded page retries and reports only the final failure', async () => {
    jest.useFakeTimers();
    render(<LessonPlayer lesson={createLesson(2, { status: 'in-progress' })} />);

    await act(async () => {
      pageWrites[0].reject({ status: 500 });
    });
    expect(toast.error).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(pageWrites).toHaveLength(2);
    await act(async () => {
      pageWrites[1].reject({ status: 500 });
    });
    expect(toast.error).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(pageWrites).toHaveLength(3);
    await act(async () => {
      pageWrites[2].reject({ status: 500 });
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('retries a page visit after navigating away during an in-flight save', async () => {
    render(<LessonPlayer lesson={createLesson(2, { progress: 0, status: 'in-progress' })} />);
    expect(pageWrites).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(pageWrites).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(pageWrites).toHaveLength(2);
    expect(screen.getByText('Page content: page-1')).toBeInTheDocument();
  });

  it('times out pending exercise writes after 8s and finishes once without aborting late writes', async () => {
    jest.useFakeTimers();
    render(<LessonPlayer lesson={createLesson()} />);
    await act(async () => {
      pageWrites[0].resolve({ success: true, progress: 0, lessonCompleted: false });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish lesson' }));
    expect(mockFinishLesson).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(8000);
    });
    await waitFor(() => expect(mockFinishLesson).toHaveBeenCalledTimes(1));
    expect(toast.info).toHaveBeenCalledWith(
      'Some exercise progress is still saving. Checking lesson completion now.'
    );
    expect(captureMessage).toHaveBeenCalledWith(
      'Lesson finish proceeded after pending-write timeout',
      expect.objectContaining({
        level: 'warning',
        tags: { surface: 'finish_lesson_timeout', lessonId: 'lesson-1' },
      })
    );

    await act(async () => {
      markWrites[0].resolve({ success: true, progress: 50, lessonCompleted: false });
      finishWrite.resolve({ success: true, progress: 100, lessonCompleted: true });
    });
    expect(screen.getByText('Progress 100%')).toBeInTheDocument();
    jest.useRealTimers();
  });

  it('clears a stale missing-exercise warning when the timed-out write later confirms completion', async () => {
    jest.useFakeTimers();
    render(<LessonPlayer lesson={createLesson()} />);
    await act(async () => {
      pageWrites[0].resolve({ success: true, progress: 0, lessonCompleted: false });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Accept exercise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish lesson' }));

    await act(async () => {
      jest.advanceTimersByTime(8000);
    });
    await waitFor(() => expect(mockFinishLesson).toHaveBeenCalledTimes(1));

    await act(async () => {
      finishWrite.reject({
        status: 422,
        data: {
          error: 'Complete all required exercises before finishing the lesson.',
          missingExercises: [
            { exerciseId: 'exercise-1', title: 'Exercise', pageId: 'page-1', pageIndex: 0 },
          ],
        },
      });
    });
    expect(screen.getByText(/complete 1 remaining exercise before finishing/i)).toBeInTheDocument();
    expect(captureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        level: 'warning',
        tags: { surface: 'finish_lesson', lessonId: 'lesson-1' },
        extra: { missingExerciseCount: 1 },
      })
    );

    await act(async () => {
      markWrites[0].resolve({
        success: true,
        progress: 100,
        lessonCompleted: true,
        completedExerciseCount: 1,
        requiredExerciseCount: 1,
      });
    });

    expect(screen.queryByText(/remaining exercise before finishing/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lesson complete/i })).toBeDisabled();
    jest.useRealTimers();
  });

  it('completes a passive-only lesson from a successful final-page visit', async () => {
    render(
      <LessonPlayer
        lesson={createLesson(1, {
          progress: 0,
          status: 'in-progress',
          pageItems: [[{ id: 'text-1', type: 'text', title: 'Read' }]],
        })}
      />
    );
    expect(screen.getByText('Progress 100%')).toBeInTheDocument();
    await act(async () => {
      pageWrites[0].resolve({ success: true, progress: 100, lessonCompleted: true, furthestPageIndex: 0 });
    });
    expect(screen.getByRole('button', { name: /lesson complete/i })).toBeDisabled();
    expect(screen.getByText('Progress 100%')).toBeInTheDocument();
  });

  it('keeps navigation progress page-based when only half the exercises are complete', async () => {
    render(<LessonPlayer lesson={createLesson(2, { progress: 50, status: 'in-progress' })} />);
    await act(async () => {
      pageWrites[0].resolve({ success: true, progress: 50, lessonCompleted: false });
    });
    expect(screen.getByText('Progress 50%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Progress 100%')).toBeInTheDocument();
  });

  it('auto-advances audio on practice pages without exercises', async () => {
    render(
      <LessonPlayer
        lesson={createLesson(2, {
          pageItems: [
            [{ id: 'text-1', type: 'text', title: 'Read' }],
            [{ id: 'exercise-2', type: 'fill', title: 'Exercise' }],
          ],
        })}
      />
    );
    await act(async () => {
      pageWrites[0].resolve({ success: true, progress: 0 });
    });
    expect(screen.getByText('Page content: page-1')).toBeInTheDocument();
    act(() => {
      audioEndedHandler?.();
    });
    expect(screen.getByText('Page content: page-2')).toBeInTheDocument();
  });

  it('ignores late mutation summaries after the lesson id changes', async () => {
    const { rerender } = render(
      <LessonPlayer
        lesson={createLesson(1, {
          id: 'lesson-a',
          progress: 0,
          status: 'in-progress',
          completedExerciseCount: 0,
          requiredExerciseCount: 1,
        })}
      />
    );
    expect(pageWrites).toHaveLength(1);
    expect(screen.getByRole('progressbar', { name: /exercise progress/i })).toHaveAttribute('aria-valuenow', '0');

    rerender(
      <LessonPlayer
        lesson={createLesson(1, {
          id: 'lesson-b',
          progress: 10,
          status: 'in-progress',
          completedExerciseCount: 0,
          requiredExerciseCount: 1,
        })}
      />
    );
    await waitFor(() => expect(pageWrites).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Finish lesson' })).toBeEnabled();
    expect(screen.getByRole('progressbar', { name: /exercise progress/i })).toHaveAttribute('aria-valuenow', '0');

    await act(async () => {
      pageWrites[0].resolve({
        success: true,
        progress: 100,
        lessonCompleted: true,
        completedExerciseCount: 1,
        requiredExerciseCount: 1,
      });
    });
    expect(screen.getByRole('button', { name: 'Finish lesson' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /lesson complete/i })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /exercise progress/i })).toHaveAttribute('aria-valuenow', '0');
  });

  it('does not auto-advance audio on practice exercise pages', async () => {
    render(
      <LessonPlayer
        lesson={createLesson(2, {
          pageItems: [
            [{ id: 'exercise-1', type: 'fill', title: 'Exercise' }],
            [{ id: 'text-2', type: 'text', title: 'Read' }],
          ],
        })}
      />
    );
    await act(async () => {
      pageWrites[0].resolve({ success: true, progress: 0 });
    });
    act(() => {
      audioEndedHandler?.();
    });
    expect(screen.getByText('Page content: page-1')).toBeInTheDocument();
  });

  it.each(['test', 'preview'] as const)('does not auto-advance audio on %s exercise pages', async runtimeMode => {
    render(
      <LessonPlayer
        lesson={createLesson(2, {
          pageItems: [
            [{ id: 'exercise-1', type: 'fill', title: 'Exercise' }],
            [{ id: 'text-2', type: 'text', title: 'Read' }],
          ],
        })}
        runtimeMode={runtimeMode}
        trackProgress={false}
      />
    );
    act(() => {
      audioEndedHandler?.();
    });
    expect(screen.getByText('Page content: page-1')).toBeInTheDocument();
  });
});
