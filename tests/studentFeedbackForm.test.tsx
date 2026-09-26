import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { FeedbackForm } from '@/src/components/student-feedback/FeedbackForm';
import { FeedbackLessonDialog } from '@/src/components/student-feedback/FeedbackLessonDialog';
import { useFeedbackDraft } from '@/src/hooks/useFeedbackDraft';
import type { FeedbackUpload } from '@/src/hooks/useFeedbackUploads';

const mockSubmit = jest.fn();
const mockDispatch = jest.fn();
const mockResetUploads = jest.fn();
const mockPauseAudio = jest.fn();
const mockUploads: { uploads: FeedbackUpload[]; uploading: boolean; failed: boolean; ready: Array<{ id: string; name: string }> } = {
  uploads: [],
  uploading: false,
  failed: false,
  ready: [],
};

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/src/store/hooks', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('@/src/hooks/useUnsavedNavigationGuard', () => ({
  useUnsavedNavigationGuard: () => ({ isOpen: false, message: '', stayOnPage: jest.fn(), leavePage: jest.fn() }),
}));
jest.mock('@/src/hooks/useFeedbackUploads', () => ({
  useFeedbackUploads: () => ({ ...mockUploads, addFiles: jest.fn(() => []), retry: jest.fn(), remove: jest.fn(), reset: mockResetUploads }),
}));
jest.mock('@/src/store/api/studentFeedbackApi', () => ({
  studentFeedbackApi: { util: { invalidateTags: (tags: unknown) => ({ type: 'invalidate', tags }) } },
  useSubmitFeedbackMutation: () => [mockSubmit, { isLoading: false }],
  useGetFeedbackLessonsQuery: () => ({
    data: {
      lessons: [
        { id: 'lesson-1', title: '<strong>First lesson</strong>' },
        { id: 'lesson-2', title: 'Second lesson' },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const receipt = (feedbackId: string) => ({ unwrap: () => Promise.resolve({ receipt: { feedbackId, submittedAt: '2026-09-24T10:00:00.000Z' } }) });
const form = () => screen.getByRole('form', { name: 'Student feedback form' });
const description = () => screen.getByLabelText('Tell us more');

function Standalone() {
  const draft = useFeedbackDraft();
  return <FeedbackForm draft={draft} />;
}

function LessonHarness() {
  const [page, setPage] = useState(1);
  return (
    <>
      <button onClick={() => setPage(2)}>Next lesson page</button>
      <FeedbackLessonDialog
        onOpen={mockPauseAudio}
        context={{ lessonId: 'lesson-1', lessonTitle: '<strong>First lesson</strong>', pageId: `page-${page}`, pageNumber: page }}
      />
    </>
  );
}

function completeBugReport() {
  fireEvent.click(screen.getByLabelText('Bug report'));
  fireEvent.click(screen.getByLabelText('Major'));
  fireEvent.click(screen.getByLabelText('Lessons'));
  fireEvent.change(description(), { target: { value: '  Audio stops\non page two  ' } });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockUploads, { uploads: [], uploading: false, failed: false, ready: [] });
  let uuid = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => `a5361411-a326-4845-8465-${String(++uuid).padStart(12, '0')}`,
  });
  mockSubmit.mockImplementation((body: { draftId: string }) => receipt(body.draftId));
});

test('shows friendly errors, focuses the first one, and submits only fields that apply', async () => {
  render(<Standalone />);
  fireEvent.submit(form());
  expect(await screen.findByText('Choose what kind of feedback this is')).toBeInTheDocument();
  expect(screen.getByText('Choose at least one area')).toBeInTheDocument();
  expect(screen.getByLabelText('Bug report')).toHaveFocus();
  expect(mockSubmit).not.toHaveBeenCalled();

  completeBugReport();
  fireEvent.click(screen.getByLabelText('Other'));
  fireEvent.submit(form());
  expect(await screen.findByText('Tell us which area you mean')).toBeInTheDocument();
  expect(screen.getByLabelText('Which other area?')).toHaveFocus();

  fireEvent.change(screen.getByLabelText('Which other area?'), { target: { value: ' Printing ' } });
  fireEvent.click(screen.getByLabelText('4 of 5: Very good'));
  fireEvent.submit(form());
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  expect(mockSubmit.mock.calls[0][0]).toMatchObject({
    draftId: 'a5361411-a326-4845-8465-000000000001',
    type: 'bug_report',
    severity: 'major',
    areas: ['lessons', 'other'],
    otherAreaExplanation: 'Printing',
    description: 'Audio stops\non page two',
    rating: 4,
    lessonId: null,
    pageId: null,
    attachments: [],
    diagnostics: { entryPoint: 'standalone' },
  });
  expect(await screen.findByText(/Reference:/)).toBeInTheDocument();
});

test('hidden answers stay in the draft but are not submitted', async () => {
  render(<Standalone />);
  completeBugReport();
  fireEvent.click(screen.getByLabelText('Other'));
  fireEvent.change(screen.getByLabelText('Which other area?'), { target: { value: 'Printing' } });
  fireEvent.click(screen.getByLabelText('Other'));
  fireEvent.click(screen.getByLabelText('Suggestion'));
  expect(screen.queryByLabelText('Major')).not.toBeInTheDocument();
  fireEvent.submit(form());
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  const sent = JSON.parse(JSON.stringify(mockSubmit.mock.calls[0][0]));
  expect(sent).toMatchObject({ type: 'feature_suggestion', areas: ['lessons'] });
  expect(sent).not.toHaveProperty('severity');
  expect(sent).not.toHaveProperty('otherAreaExplanation');
});

test('waits for uploads and asks the student to fix failed ones', async () => {
  mockUploads.uploading = true;
  const { rerender } = render(<Standalone />);
  expect(screen.getByRole('button', { name: /Waiting for uploads/ })).toBeDisabled();

  Object.assign(mockUploads, { uploading: false, failed: true });
  rerender(<Standalone />);
  completeBugReport();
  fireEvent.submit(form());
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Retry or remove the files that failed to upload.'));
  expect(mockSubmit).not.toHaveBeenCalled();
});

test('a removed lesson is cleared from the draft so the student can send again', async () => {
  mockSubmit.mockReturnValueOnce({
    unwrap: () => Promise.reject({ status: 409, data: { code: 'FEEDBACK_LESSON_UNAVAILABLE', error: 'Gone' } }),
  });
  render(<Standalone />);
  completeBugReport();
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: 'Second lesson' }));
  fireEvent.submit(form());
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no longer available')));
  expect(mockSubmit.mock.calls[0][0]).toMatchObject({ lessonId: 'lesson-2' });
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'invalidate', tags: ['FeedbackLessons'] });
  expect(screen.getByRole('combobox')).toHaveTextContent('Not about a specific lesson');

  fireEvent.submit(form());
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
  expect(mockSubmit.mock.calls[1][0]).toMatchObject({ lessonId: null, draftId: mockSubmit.mock.calls[0][0].draftId });
});

test('the lesson panel pauses audio, keeps the draft when closed and follows the current page', async () => {
  render(<LessonHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  expect(mockPauseAudio).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('combobox')).toHaveTextContent('First lesson');
  expect(screen.getByRole('combobox')).toHaveTextContent('Page 1');
  fireEvent.change(description(), { target: { value: 'A draft that stays' } });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body.style.pointerEvents).not.toBe('none');

  fireEvent.click(screen.getByRole('button', { name: 'Next lesson page' }));
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  expect(description()).toHaveValue('A draft that stays');
  expect(screen.getByRole('combobox')).toHaveTextContent('Page 2');
  completeBugReport();
  fireEvent.submit(form());
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  expect(mockSubmit.mock.calls[0][0]).toMatchObject({
    lessonId: 'lesson-1',
    pageId: 'page-2',
    diagnostics: { entryPoint: 'lesson' },
  });
});

test.each(['Back to lesson', 'Escape'])('a sent lesson report starts fresh after %s', async closeAction => {
  render(<LessonHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  completeBugReport();
  fireEvent.submit(form());
  expect(await screen.findByText(/Reference:/)).toBeInTheDocument();
  if (closeAction === 'Escape') fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  else fireEvent.click(screen.getByRole('button', { name: closeAction }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mockResetUploads).toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  expect(description()).toHaveValue('');
  completeBugReport();
  fireEvent.submit(form());
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
  expect(mockSubmit.mock.calls[1][0].draftId).not.toBe(mockSubmit.mock.calls[0][0].draftId);
});

test('choosing a different lesson drops the page, and choosing the current one restores it', async () => {
  render(<LessonHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: 'Second lesson' }));
  expect(screen.getByRole('combobox')).not.toHaveTextContent('Page');
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: 'First lesson' }));
  expect(screen.getByRole('combobox')).toHaveTextContent('Page 1');
  await act(async () => undefined);
});
