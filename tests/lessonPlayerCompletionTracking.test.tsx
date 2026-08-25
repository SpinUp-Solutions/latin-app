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
  default: () => ({ audioRef: { current: null }, isPlaying: false, togglePlay: jest.fn() }),
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
    onPrevious,
    onNext,
    onFinish,
    isFinishing,
  }: {
    currentPageIndex: number;
    totalPages: number;
    onPrevious: () => void;
    onNext: () => void;
    onFinish: () => void;
    isFinishing?: boolean;
  }) => {
    const canGoNext = currentPageIndex < totalPages - 1;
    return (
      <nav>
        <button type="button" onClick={onPrevious}>
          Previous page
        </button>
        <button type="button" onClick={canGoNext ? onNext : onFinish} disabled={!canGoNext && isFinishing}>
          {canGoNext ? 'Next page' : isFinishing ? 'Finishing…' : 'Finish lesson'}
        </button>
      </nav>
    );
  },
}));

const createLesson = (pageCount = 1) =>
  ({
    id: 'lesson-1',
    title: 'Tracked lesson',
    type: 'normal',
    pages: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${index + 1}`,
      items: [{ id: 'exercise-1', type: 'fill', title: 'Exercise' }],
    })),
    isLive: false,
    liveOrder: null,
    publishedAt: null,
    publishedBy: null,
  }) as unknown as LessonWithProgress;

let markWrites: Array<Deferred<{ success: boolean }>>;
let finishWrite: Deferred<{ success: boolean }>;

beforeEach(() => {
  jest.clearAllMocks();
  markWrites = [];
  finishWrite = createDeferred<{ success: boolean }>();

  jest.mocked(useMarkExerciseCompleteMutation).mockReturnValue([mockMarkExerciseComplete] as never);
  jest.mocked(useUpdatePageProgressMutation).mockReturnValue([mockUpdatePageProgress] as never);
  jest.mocked(useFinishLessonMutation).mockReturnValue([mockFinishLesson, { isLoading: false }] as never);

  mockUpdatePageProgress.mockReturnValue({ unwrap: () => Promise.resolve({ success: true }) });
  mockMarkExerciseComplete.mockImplementation(() => {
    const write = createDeferred<{ success: boolean }>();
    markWrites.push(write);
    return { unwrap: () => write.promise };
  });
  mockFinishLesson.mockReturnValue({ unwrap: () => finishWrite.promise });
});

describe('LessonPlayer accepted completion tracking', () => {
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
    expect(toast.error).toHaveBeenCalledWith('Unable to save your exercise progress. Please try again.');

    await act(async () => {
      finishWrite.resolve({ success: true });
    });
  });
});
