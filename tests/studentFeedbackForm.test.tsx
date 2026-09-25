import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedbackComposer } from '@/src/components/student-feedback/FeedbackComposer';
import { FeedbackLessonDialog } from '@/src/components/student-feedback/FeedbackLessonDialog';

const mockSubmit = jest.fn();
const mockCreateSession = jest.fn();
const mockGetSession = jest.fn();
const mockRefetchLessons = jest.fn();
const mockResetAttachments = jest.fn();
let mockAuthUid = 'student-1';
let mockAttachmentItems: Array<{ id: string; name: string; size: number; status: 'error'; progress: number; error: string }> = [];

jest.mock('@/src/hooks/useAuth', () => ({ useAuth: () => ({ authUid: mockAuthUid }) }));
jest.mock('@/src/hooks/useFeedbackAttachments', () => ({ useFeedbackAttachments: () => ({ items: mockAttachmentItems, addFiles: jest.fn(), retry: jest.fn(), remove: jest.fn(), reset: mockResetAttachments, readyIds: [], hasPendingOrFailed: mockAttachmentItems.length > 0 }) }));
jest.mock('@/src/hooks/useUnsavedNavigationGuard', () => ({ useUnsavedNavigationGuard: () => ({ isOpen: false, message: '', stayOnPage: jest.fn(), leavePage: jest.fn(), requestNavigation: jest.fn(), replaceAfterSave: jest.fn() }) }));
jest.mock('@/src/store/api/studentFeedbackApi', () => ({
  useCreateFeedbackSessionMutation: () => [mockCreateSession],
  useLazyGetFeedbackSessionQuery: () => [mockGetSession],
  useSubmitFeedbackMutation: () => [mockSubmit, { isLoading: false }],
  useGetFeedbackLessonsQuery: () => ({ data: { lessons: [
    { id: 'lesson-1', title: '<strong>First lesson</strong>', revision: 3 },
    { id: 'lesson-2', title: 'Second lesson', revision: 2 },
  ] }, isLoading: false, isError: false, refetch: mockRefetchLessons }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthUid = 'student-1';
  mockAttachmentItems = [];
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => 'a5361411-a326-4845-8465-259154c05e14' });
  mockCreateSession.mockReturnValue({ unwrap: () => Promise.resolve({ session: { status: 'open' } }) });
  mockSubmit.mockReturnValue({ unwrap: () => Promise.resolve({ receipt: { feedbackId: 'a5361411-a326-4845-8465-259154c05e14', submittedAt: '2026-09-24T10:00:00.000Z' } }) });
  mockGetSession.mockReturnValue({ unwrap: () => Promise.resolve({ session: { status: 'open', receipt: null } }) });
});

function completeRequiredFields() {
  fireEvent.click(screen.getByLabelText('Bug report'));
  fireEvent.click(screen.getByLabelText('Major (broken with workaround)'));
  fireEvent.click(screen.getByLabelText('Lessons / lesson content'));
  fireEvent.change(screen.getByLabelText(/Describe the issue or suggestion/), { target: { value: '  A broken thing\nOn the next line  ' } });
}

test('requires conditional fields, focuses the first error, and submits trimmed plain text', async () => {
  render(<FeedbackComposer entryPoint="standalone" />);
  expect(screen.getByLabelText('Bug report')).not.toBeChecked();
  expect(screen.getByLabelText('No rating')).toBeChecked();
  fireEvent.submit(screen.getByRole('form', { name: 'Student feedback form' }));
  expect(await screen.findByText(/Invalid option/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Bug report')).toHaveFocus());
  completeRequiredFields();
  fireEvent.click(screen.getByLabelText('Other', { exact: true }));
  fireEvent.submit(screen.getByRole('form', { name: 'Student feedback form' }));
  expect(screen.getByLabelText(/Please explain Other/)).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(screen.getByLabelText(/Please explain Other/), { target: { value: '  Screen layout  ' } });
  fireEvent.click(screen.getByLabelText('Other', { exact: true }));
  fireEvent.click(screen.getByLabelText('Other', { exact: true }));
  fireEvent.change(screen.getByLabelText(/Please explain Other/), { target: { value: '  Screen layout  ' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Student feedback form' }));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  const body = mockSubmit.mock.calls[0][0];
  expect(body).toMatchObject({ type: 'bug_report', severity: 'major', areas: ['lessons', 'other'], otherAreaExplanation: 'Screen layout', description: 'A broken thing\nOn the next line', lessonId: null, attachmentIds: [] });
  expect(body.diagnostics.route).not.toContain('?');
  expect(await screen.findByText(/Reference:/)).toBeInTheDocument();
});

test('changing feedback type and lesson clears irrelevant severity and page context', async () => {
  render(<FeedbackComposer entryPoint="lesson" lessonContext={{ lessonId: 'lesson-1', pageId: 'page-2', pageIndex: 1, revision: 3 }} />);
  completeRequiredFields();
  fireEvent.click(screen.getByLabelText('Feature suggestion'));
  expect(screen.queryByLabelText('Major (broken with workaround)')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Related lesson (optional)'), { target: { value: 'lesson-2' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Student feedback form' }));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  expect(mockSubmit.mock.calls[0][0]).toMatchObject({ type: 'feature_suggestion', lessonId: 'lesson-2', pageContext: null });
  expect(mockSubmit.mock.calls[0][0]).not.toHaveProperty('severity');
});

test('lesson dialog preserves the draft after closing and releases the modal layer', async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return <FeedbackLessonDialog open={open} onOpenChange={setOpen} context={{ lessonId: 'lesson-1', pageId: 'page-2', pageIndex: 1, revision: 3 }} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  fireEvent.change(screen.getByLabelText(/Describe the issue or suggestion/), { target: { value: 'A draft that stays' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close feedback' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Share feedback' })).not.toBeInTheDocument());
  expect(document.body.style.pointerEvents).not.toBe('none');
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  expect(screen.getByLabelText(/Describe the issue or suggestion/)).toHaveValue('A draft that stays');
});

test('expired submission session retains the draft and retries with a new session ID', async () => {
  let uuid = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => `a5361411-a326-4845-8465-${String(++uuid).padStart(12, '0')}` });
  mockSubmit.mockReturnValueOnce({ unwrap: () => Promise.reject({ status: 409, data: { code: 'FEEDBACK_SESSION_EXPIRED', error: 'Expired' } }) });
  render(<FeedbackComposer entryPoint="standalone" />);
  completeRequiredFields();
  fireEvent.submit(screen.getByRole('form', { name: 'Student feedback form' }));
  await waitFor(() => expect(mockResetAttachments).toHaveBeenCalled());
  expect(screen.getByLabelText(/Describe the issue or suggestion/)).toHaveValue('  A broken thing\nOn the next line  ');
  fireEvent.submit(screen.getByRole('form', { name: 'Student feedback form' }));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
  expect(mockSubmit.mock.calls[1][0].sessionId).not.toBe(mockSubmit.mock.calls[0][0].sessionId);
});

test('failed upload can be discarded with its expired session without losing written feedback', async () => {
  let uuid = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => `a5361411-a326-4845-8465-${String(++uuid).padStart(12, '0')}` });
  mockAttachmentItems = [{ id: 'attachment-1', name: 'screen.png', size: 1024, status: 'error', progress: 1, error: 'Feedback session expired' }];
  mockResetAttachments.mockImplementation(() => { mockAttachmentItems = []; });
  render(<FeedbackComposer entryPoint="standalone" />);
  completeRequiredFields();
  expect(screen.getByRole('button', { name: 'Submit feedback' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove uploads and start a new session' }));
  expect(mockResetAttachments).toHaveBeenCalled();
  expect(screen.getByLabelText(/Describe the issue or suggestion/)).toHaveValue('  A broken thing\nOn the next line  ');
  expect(screen.getByRole('button', { name: 'Submit feedback' })).toBeEnabled();
});
