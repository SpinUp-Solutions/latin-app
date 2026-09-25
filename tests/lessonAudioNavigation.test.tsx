import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LessonPlayer } from '@/src/components/ui/lesson/lesson-player';
import { auth } from '@/src/services/firebase';
import type { LessonWithProgress } from '@/src/types/lesson';

jest.mock('@/src/components/student-feedback/FeedbackLessonDialog', () => ({ FeedbackLessonDialog: () => null }));

jest.mock('@/src/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'student-1' } }) }));
jest.mock('@/src/store/api/lessonApi', () => ({
  useMarkExerciseCompleteMutation: () => [jest.fn()],
  useUpdatePageProgressMutation: () => [jest.fn()],
  useFinishLessonMutation: () => [jest.fn(), { isLoading: false }],
}));
jest.mock('@/src/components/ui/lesson/page-template', () => ({
  __esModule: true,
  default: ({ page }: { page: { id: string } }) => <div>Content {page.id}</div>,
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};
const lesson = (secondAudioPath: string | null = 'second.mp3', secondPageHasExercise = false) =>
  ({
    id: 'audio-lesson',
    title: 'Audio lesson',
    type: 'normal',
    pages: [
      { id: 'first', audioPath: 'first.mp3', items: [] },
      {
        id: 'second',
        audioPath: secondAudioPath,
        items: secondPageHasExercise ? [{ id: 'exercise', type: 'fill' }] : [],
      },
      { id: 'third', items: [] },
    ],
  }) as unknown as LessonWithProgress;
const response = { ok: true, json: async () => ({ signedUrl: 'https://example.test/audio.mp3' }) } as Response;
let play: jest.SpyInstance;
let pause: jest.SpyInstance;
let fetchMock: jest.SpyInstance;
const toggle = () => fireEvent.click(screen.getByRole('button', { name: /play audio|pause audio/i }));

beforeEach(() => {
  Object.assign(auth, { currentUser: { getIdToken: jest.fn().mockResolvedValue('test-token') } });
  play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response);
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

it.each(['second.mp3', 'first.mp3', null])('stops old audio and ignores its end after Next to %s', async secondPath => {
  const { container } = render(<LessonPlayer lesson={lesson(secondPath)} trackProgress={false} />);
  const firstAudio = container.querySelector('audio')!;
  await act(async () => {
    toggle();
  });
  expect(play).toHaveBeenCalledTimes(1);
  pause.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(pause.mock.instances).toContain(firstAudio);
  fireEvent.ended(firstAudio);
  expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
  if (secondPath) {
    await act(async () => {
      toggle();
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).audioPath).toBe(secondPath);
  }
});

it('cancels a delayed signed URL after navigation and plays the new source', async () => {
  const pending = deferred<Response>();
  fetchMock.mockReturnValueOnce(pending.promise);
  render(<LessonPlayer lesson={lesson()} trackProgress={false} />);
  await act(async () => {
    toggle();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await act(async () => {
    pending.resolve(response);
  });
  expect(play).not.toHaveBeenCalled();
  await act(async () => {
    toggle();
  });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).audioPath).toBe('second.mp3');
  expect(play).toHaveBeenCalledTimes(1);
});

it('ignores a delayed play resolution and ended event from the previous page', async () => {
  const pending = deferred<void>();
  play.mockReturnValueOnce(pending.promise);
  const { container } = render(<LessonPlayer lesson={lesson()} trackProgress={false} />);
  const firstAudio = container.querySelector('audio')!;
  await act(async () => {
    toggle();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await act(async () => {
    pending.resolve();
  });
  expect(screen.getByRole('button', { name: 'Play audio' })).toBeInTheDocument();
  fireEvent.ended(firstAudio);
  expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
});

it('cancels pending playback when the lesson unmounts', async () => {
  const pending = deferred<Response>();
  fetchMock.mockReturnValueOnce(pending.promise);
  const { unmount } = render(<LessonPlayer lesson={lesson()} trackProgress={false} />);
  await act(async () => {
    toggle();
  });
  unmount();
  await act(async () => {
    pending.resolve(response);
  });
  expect(play).not.toHaveBeenCalled();
});

it('still advances once when the current passive page finishes playing', async () => {
  const { container } = render(<LessonPlayer lesson={lesson()} trackProgress={false} />);
  const firstAudio = container.querySelector('audio')!;
  await act(async () => {
    toggle();
  });
  fireEvent.ended(firstAudio);
  expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
  fireEvent.ended(firstAudio);
  expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
});

it('does not advance an exercise page when its current audio finishes', async () => {
  const { container } = render(<LessonPlayer lesson={lesson('second.mp3', true)} trackProgress={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await act(async () => {
    toggle();
  });
  fireEvent.ended(container.querySelector('audio')!);
  expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
});

it('stops playback when navigating back', async () => {
  const { container } = render(<LessonPlayer lesson={lesson()} trackProgress={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  const secondAudio = container.querySelector('audio')!;
  await act(async () => {
    toggle();
  });
  pause.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Prev' }));
  expect(pause.mock.instances).toContain(secondAudio);
  fireEvent.ended(secondAudio);
  expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();
});

it('stops playback when jumping directly to another page', async () => {
  const { container } = render(<LessonPlayer lesson={lesson()} trackProgress={false} />);
  const firstAudio = container.querySelector('audio')!;
  await act(async () => {
    toggle();
  });
  pause.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Page 1 / 3' }));
  fireEvent.click(screen.getByRole('button', { name: '3' }));
  expect(pause.mock.instances).toContain(firstAudio);
  fireEvent.ended(firstAudio);
  expect(screen.getByText('Page 3 / 3')).toBeInTheDocument();
});
