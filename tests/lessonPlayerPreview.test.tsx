import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LessonPlayer } from '@/src/components/ui/lesson/lesson-player';
import type { LessonWithProgress } from '@/src/types/lesson';
import {
  useFinishLessonMutation,
  useMarkExerciseCompleteMutation,
  useUpdatePageProgressMutation,
} from '@/src/store/api/lessonApi';
import { toast } from 'sonner';

const mockMarkExerciseComplete = jest.fn(() => ({ unwrap: () => Promise.resolve({ success: true }) }));
const mockUpdatePageProgress = jest.fn(() => ({ unwrap: () => Promise.resolve({ success: true }) }));
const mockFinishLesson = jest.fn(() => ({ unwrap: () => Promise.resolve({ success: true }) }));
const mockPause = jest.fn();
let mockAudioEnded: (() => void) | undefined;

jest.mock('@/src/store/api/lessonApi', () => ({
  useMarkExerciseCompleteMutation: jest.fn(),
  useUpdatePageProgressMutation: jest.fn(),
  useFinishLessonMutation: jest.fn(),
}));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' }, authUid: 'admin-1' }),
}));

jest.mock('@/src/hooks/useAudio', () => ({
  __esModule: true,
  default: (_path: string, onEnded: () => void) => {
    mockAudioEnded = onEnded;
    return { audioRef: { current: null }, isPlaying: false, togglePlay: jest.fn(), pause: mockPause };
  },
}));

jest.mock('@/src/components/student-feedback/FeedbackLessonDialog', () => ({
  FeedbackLessonDialog: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) =>
    <button type="button" onClick={() => onOpenChange(true)}>Feedback</button>,
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

jest.mock('@/src/components/ui/lesson/page-template', () => ({
  __esModule: true,
  default: ({
    onCompletionAccepted,
    runtimeMode,
  }: {
    onCompletionAccepted?: (exerciseId: string, score: number) => void;
    runtimeMode: string;
  }) => (
    <>
      <span>Runtime mode: {runtimeMode}</span>
      <button type="button" onClick={() => onCompletionAccepted?.('exercise-1', 100)}>
        Complete exercise
      </button>
    </>
  ),
}));

jest.mock('@/src/components/ui/exercises/lesson-navigation', () => ({
  __esModule: true,
  default: ({ onFinish }: { onFinish: () => void }) => (
    <button type="button" onClick={onFinish}>
      Finish lesson
    </button>
  ),
}));

const lesson = {
  id: 'lesson-1',
  title: 'Preview lesson',
  type: 'normal',
  pages: [
    {
      id: 'page-1',
      items: [{ id: 'exercise-1', type: 'fill', title: 'Exercise' }],
    },
  ],
  isLive: false,
  liveOrder: null,
  publishedAt: null,
  publishedBy: null,
} as unknown as LessonWithProgress;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useMarkExerciseCompleteMutation).mockReturnValue([mockMarkExerciseComplete] as never);
  jest.mocked(useUpdatePageProgressMutation).mockReturnValue([mockUpdatePageProgress] as never);
  jest.mocked(useFinishLessonMutation).mockReturnValue([mockFinishLesson, { isLoading: false }] as never);
});

describe('LessonPlayer preview mode', () => {
  it('preserves practice feedback mode without persisting progress', async () => {
    render(<LessonPlayer lesson={lesson} trackProgress={false} />);

    expect(screen.getByText('Runtime mode: practice')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    await waitFor(() => expect(mockUpdatePageProgress).not.toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Complete exercise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish lesson' }));

    expect(mockMarkExerciseComplete).not.toHaveBeenCalled();
    expect(mockFinishLesson).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('Preview mode: progress is not tracked.');
  });

  it('does not persist progress in test runtime even when trackProgress is true', async () => {
    render(<LessonPlayer lesson={lesson} trackProgress runtimeMode="test" />);

    await waitFor(() => expect(mockUpdatePageProgress).not.toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Complete exercise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish lesson' }));

    expect(mockMarkExerciseComplete).not.toHaveBeenCalled();
    expect(mockFinishLesson).not.toHaveBeenCalled();
  });

  it('pauses audio and blocks auto-advance when real lesson feedback opens while retaining the page', () => {
    const twoPageLesson = { ...lesson, pages: [...lesson.pages, { id: 'page-2', items: [] }] } as LessonWithProgress;
    render(<LessonPlayer lesson={twoPageLesson} />);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    expect(mockPause).toHaveBeenCalledTimes(1);
    act(() => mockAudioEnded?.());
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete exercise' })).toBeInTheDocument();
  });
});
