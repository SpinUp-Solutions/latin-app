import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { LessonPlayer } from '@/src/components/ui/lesson/lesson-player';
import type { LessonWithProgress } from '@/src/types/lesson';
import type { FillExercise } from '@/src/types/exercises/fill';
import type { MatchingExercise } from '@/src/types/exercises/matching';
import { auth } from '@/src/services/firebase';

jest.mock('framer-motion', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Div = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; transition?: unknown }
  >(({ initial: _initial, animate: _animate, transition: _transition, ...props }, ref) => <div {...props} ref={ref} />);
  Div.displayName = 'MotionDiv';
  return { motion: { div: Div } };
});
jest.mock('@/src/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'student' } }) }));
const mockComplete = jest.fn(() => ({ unwrap: async () => ({ success: true, completedExerciseCount: 1 }) }));
jest.mock('@/src/store/api/lessonApi', () => ({
  useMarkExerciseCompleteMutation: () => [mockComplete],
  useUpdatePageProgressMutation: () => [jest.fn(() => ({ unwrap: async () => ({ success: true }) }))],
  useFinishLessonMutation: () => [jest.fn(), { isLoading: false }],
}));
jest.mock('@/src/store/api/advancedVocabularyApi', () => ({
  useGetGeneratedExerciseWordsQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));
jest.mock('@/src/components/ui/core/simple-rich-editor', () => ({ SimpleRichEditor: () => null }));
jest.mock('@/src/hooks/useTranslationGrading', () => ({
  useTranslationGrading: () => ({ grade: jest.fn(), reset: jest.fn(), isLoading: false, data: null, error: null }),
}));

const fill = (auto = false): FillExercise => ({
  id: 'fill',
  type: 'fill',
  title: 'Practice',
  instructions: '',
  itemProgressionDelay: 1000,
  feedbackConfig: {
    escalationLevels: [{ message: 'Try again', showHint: false, showAnswer: false }],
    maxLevelFailures: 2,
    progressionRules: { autoAdvanceOnCorrect: auto, pauseForExplanation: false, showProgress: true },
  },
  data: {
    items: [
      { text: 'First', answer: 'one' },
      { text: 'Second', answer: 'two' },
    ],
  },
});
const lesson = (exercise = fill(), autoAdvance = false) =>
  ({
    id: 'retention',
    title: 'Retention',
    type: 'normal',
    status: 'available',
    pages: [
      { id: 'p1', items: [exercise], autoAdvance: { enabled: autoAdvance, delay: 500 } },
      { id: 'p2', items: [{ id: 'text', type: 'text', content: 'Second page' }] },
      { id: 'p3', items: [] },
    ],
  }) as unknown as LessonWithProgress;
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
const prev = () => fireEvent.click(screen.getByRole('button', { name: 'Prev' }));
const submit = (value: string) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
};
const resume = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
beforeEach(() => {
  jest.useFakeTimers();
  mockComplete.mockClear();
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('retains partial progress, an unsubmitted draft and working Continue through Next/Prev', () => {
  render(<LessonPlayer lesson={lesson()} trackProgress={false} />);
  submit('one');
  next();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  prev();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(screen.getByRole('textbox')).toHaveValue('one');
  resume();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unfinished draft' } });
  next();
  prev();
  expect(screen.getByRole('textbox')).toHaveValue('unfinished draft');
  expect(screen.getByText('1 of 2 complete (50%)')).toBeVisible();
  submit('two');
  resume();
  next();
  prev();
  expect(screen.getByText('2 of 2 complete (100%)')).toBeVisible();
  expect(screen.getByRole('textbox')).toBeDisabled();
});

it('preserves failure attempts and allows an explicit Start over after returning', () => {
  render(<LessonPlayer lesson={lesson()} trackProgress={false} />);
  submit('wrong');
  next();
  prev();
  submit('wrong');
  fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByText('0 of 2 complete (0%)')).toBeVisible();
  submit('wrong');
  expect(screen.queryByRole('button', { name: 'Start over' })).not.toBeInTheDocument();
});

it('pauses a pending item timer while hidden and resumes it on return', () => {
  render(<LessonPlayer lesson={lesson(fill(true))} trackProgress={false} />);
  submit('one');
  act(() => jest.advanceTimersByTime(400));
  next();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Page 2 / 3')).toBeVisible();
  prev();
  expect(screen.getByRole('textbox')).toHaveValue('one');
  act(() => jest.advanceTimersByTime(600));
  expect(screen.getByText('Question 2 of 2')).toBeVisible();
  expect(screen.getByRole('textbox')).toBeEnabled();
});

it('does not replay completed-page navigation or duplicate completion writes on return', async () => {
  render(<LessonPlayer lesson={lesson(fill(), true)} />);
  submit('one');
  resume();
  submit('two');
  resume();
  await act(async () => {});
  expect(mockComplete).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(500));
  expect(screen.getByText('Page 2 / 3')).toBeVisible();
  prev();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Page 1 / 3')).toBeVisible();
  expect(mockComplete).toHaveBeenCalledTimes(1);
});

it('cancels pending page navigation when the student leaves manually', () => {
  render(<LessonPlayer lesson={lesson(fill(), true)} trackProgress={false} />);
  submit('one');
  resume();
  submit('two');
  resume();
  next();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Page 2 / 3')).toBeVisible();
  prev();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Page 1 / 3')).toBeVisible();
});

it('starts fresh when switching lessons even if page/exercise IDs are reused', () => {
  const initial = lesson();
  const view = render(<LessonPlayer lesson={initial} trackProgress={false} />);
  submit('one');
  resume();
  view.rerender(<LessonPlayer lesson={{ ...initial, id: 'another-lesson' }} trackProgress={false} />);
  expect(screen.getByText('0 of 2 complete (0%)')).toBeVisible();
  expect(screen.getByRole('textbox')).toHaveValue('');
});

it('retains matching pairs and an incomplete selection', () => {
  const matching: MatchingExercise = {
    id: 'matching',
    type: 'matching',
    title: 'Pairs',
    instructions: '',
    feedbackConfig: fill().feedbackConfig,
    data: {
      leftColumn: [
        { id: 'a', value: 'A' },
        { id: 'b', value: 'B' },
      ],
      rightColumn: [
        { id: 'c', value: 'C' },
        { id: 'd', value: 'D' },
      ],
      answers: { a: 'c', b: 'd' },
    },
  };
  const data = lesson();
  data.pages[0].items = [matching];
  render(<LessonPlayer lesson={data} trackProgress={false} />);
  const column = (label: string) => within(screen.getByText(label).parentElement!).getAllByRole('button');
  fireEvent.click(column('Select from left column:')[0]);
  fireEvent.click(column('Match with right column:')[0]);
  fireEvent.click(column('Select from left column:')[1]);
  next();
  prev();
  expect(screen.getByText('1 of 2 matches completed')).toBeVisible();
  fireEvent.click(column('Match with right column:')[1]);
  expect(screen.getByText('2 of 2 matches completed')).toBeVisible();
  resume();
  next();
  prev();
  expect(screen.getByText('2 of 2 matches completed')).toBeVisible();
});

it('stops exercise audio and cancels a delayed audio request when its page is hidden', async () => {
  Object.assign(auth, { currentUser: { getIdToken: async () => 'test-token' } });
  const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  let resolve!: (response: Response) => void;
  jest.spyOn(global, 'fetch').mockReturnValue(
    new Promise<Response>(r => {
      resolve = r;
    })
  );
  const exercise = { ...fill(), audioPath: 'exercise.mp3' };
  render(<LessonPlayer lesson={lesson(exercise)} trackProgress={false} />);
  const audioButton = within(screen.getByRole('heading', { name: 'Practice' }).parentElement!).getByRole('button');
  await act(async () => {
    fireEvent.click(audioButton);
  });
  next();
  await act(async () => {
    resolve({ ok: true, json: async () => ({ signedUrl: 'https://example.test/audio.mp3' }) } as Response);
  });
  expect(play).not.toHaveBeenCalled();
  prev();
  expect(screen.getByText('Page 1 / 3')).toBeVisible();
});

it('retains a multi-word selection before Check and can still complete it after returning', () => {
  const data = lesson();
  data.pages[0].items = [
    {
      id: 'words',
      type: 'click-on-multiple-words',
      title: 'Select words',
      instructions: '',
      feedbackConfig: fill().feedbackConfig,
      data: { passage: 'unus duo tres', correctWordIndices: [0, 2] },
    },
  ];
  render(<LessonPlayer lesson={data} trackProgress={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Word 1: unus' }));
  next();
  prev();
  expect(screen.getByRole('button', { name: 'Word 1: unus' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Word 3: tres' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Selections' }));
  expect(screen.getByText('Correct!')).toBeVisible();
});

it('discards old local answers when the lesson content version changes', () => {
  const data = { ...lesson(), version: 1 };
  const view = render(<LessonPlayer lesson={data} trackProgress={false} />);
  submit('one');
  resume();
  view.rerender(<LessonPlayer lesson={{ ...data, version: 2 }} trackProgress={false} />);
  expect(screen.getByText('0 of 2 complete (0%)')).toBeVisible();
});
