import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedbackList } from '@/src/components/admin/feedback/FeedbackList';
import { FeedbackDetail } from '@/src/components/admin/feedback/FeedbackDetail';

const mockReplace = jest.fn();
const mockDispatch = jest.fn();
const mockListRefetch = jest.fn();
const mockCountRefetch = jest.fn();
const mockDetailRefetch = jest.fn();
const mockUpdate = jest.fn();
const mockAddNote = jest.fn();
let mockSearch = 'status=resolved&sort=oldest';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/src/store/hooks', () => ({ useAppDispatch: () => mockDispatch }));
jest.mock('@/src/hooks/useAuth', () => ({ useAuth: () => ({ authUid: 'admin-1' }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/src/store/api/studentFeedbackApi', () => ({
  useGetAdminFeedbackListQuery: () => ({ currentData: { items: [{ id: 'report-1', type: 'bug_report', severity: 'minor', areas: ['lessons'], description: '<script>alert(1)</script>', submitter: { uid: 'student-1', displayName: 'Student', email: 'student@example.edu' }, lesson: { id: 'lesson-1', title: '<strong>Lesson</strong>' }, createdAt: '2026-09-24T10:00:00.000Z', status: 'resolved', archived: false, stateRevision: 1, attachments: [] }], nextCursor: 'next' }, isLoading: false, isFetching: false, isError: false, refetch: mockListRefetch }),
  useGetAdminFeedbackCountQuery: () => ({ data: { count: 2 }, refetch: mockCountRefetch }),
  useGetAdminFeedbackDetailQuery: () => ({ data: { feedback: {
    id: 'report-1', type: 'bug_report', severity: 'minor', areas: ['lessons'], description: '<script>alert(1)</script>', comments: null,
    submitter: { uid: 'student-1', displayName: 'Student', email: 'student@example.edu' },
    lesson: { id: 'lesson-1', title: '<strong>Old lesson</strong>', pageId: 'page-1', pageIndex: 0, pageTitle: 'Original page', revision: 1 },
    createdAt: '2026-09-24T10:00:00.000Z', status: 'unresolved', archived: false, stateRevision: 1, attachments: [],
    diagnostics: { entryPoint: 'lesson', browser: 'Browser', route: '/lesson/lesson-1', viewport: { width: 390, height: 844 } },
  }, currentLesson: { id: 'lesson-1', title: '<strong>Current lesson</strong>' } }, isLoading: false, isError: false, refetch: mockDetailRefetch }),
  useGetAdminFeedbackActivityQuery: () => ({ currentData: { items: [], nextCursor: null }, isLoading: false, isError: false }),
  useUpdateAdminFeedbackStateMutation: () => [mockUpdate, { isLoading: false }],
  useAddAdminFeedbackNoteMutation: () => [mockAddNote, { isLoading: false }],
  useLazyGetAdminFeedbackAttachmentAccessQuery: () => [jest.fn(), { isFetching: false }],
  refreshFeedbackListPageOne: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = 'status=resolved&sort=oldest';
  let counter = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => `a5361411-a326-4845-8465-${String(++counter).padStart(12, '0')}` });
  mockAddNote.mockReturnValue({ unwrap: () => Promise.reject(new Error('network failed')) });
  mockUpdate.mockReturnValue({ unwrap: () => Promise.reject({ status: 409, data: { code: 'FEEDBACK_REVISION_CONFLICT', error: 'Conflict' } }) });
});

test('admin list keeps URL filters in detail links and applies exact search only when requested', () => {
  render(<FeedbackList />);
  expect(screen.getByRole('heading', { name: 'Feedback' })).toBeInTheDocument();
  const detail = screen.getByRole('link', { name: /Bug report/ });
  expect(detail).toHaveAttribute('href', expect.stringContaining(encodeURIComponent('/admin/feedback?status=resolved&sort=oldest')));
  fireEvent.change(screen.getByLabelText('Exact submitter email'), { target: { value: 'student@example.edu' } });
  expect(mockReplace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply search' }));
  expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('submitterEmail=student%40example.edu'));
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
});

test('admin detail distinguishes historical/current lesson and reloads after revision conflict', async () => {
  mockSearch = `return=${encodeURIComponent('/admin/feedback?status=resolved&sort=oldest')}`;
  render(<FeedbackDetail feedbackId="report-1" />);
  expect(screen.getByText('Old lesson')).toBeInTheDocument();
  expect(screen.getByText('Current lesson')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Preview lesson' })).toHaveAttribute('href', '/admin/lessons/preview/lesson-1');
  expect(screen.getByRole('link', { name: 'Back to feedback' })).toHaveAttribute('href', '/admin/feedback?status=resolved&sort=oldest');
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
  await waitFor(() => expect(mockDetailRefetch).toHaveBeenCalled());
  expect(mockUpdate).toHaveBeenCalledWith({ feedbackId: 'report-1', action: 'resolve', expectedRevision: 1 });
});

test('editing a note after an ambiguous failure uses a new idempotency key', async () => {
  render(<FeedbackDetail feedbackId="report-1" />);
  fireEvent.change(screen.getByLabelText('Add a private admin note'), { target: { value: 'First note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(mockAddNote).toHaveBeenCalledTimes(1));
  const firstId = mockAddNote.mock.calls[0][0].requestId;
  fireEvent.change(screen.getByLabelText('Add a private admin note'), { target: { value: 'Changed note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(mockAddNote).toHaveBeenCalledTimes(2));
  expect(mockAddNote.mock.calls[1][0].requestId).not.toBe(firstId);
});

test('editing a note while an earlier save is pending preserves the new draft', async () => {
  let resolveSave: ((value: unknown) => void) | undefined;
  mockAddNote.mockReturnValue({ unwrap: () => new Promise(resolve => { resolveSave = resolve; }) });
  render(<FeedbackDetail feedbackId="report-1" />);
  fireEvent.change(screen.getByLabelText('Add a private admin note'), { target: { value: 'First note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(mockAddNote).toHaveBeenCalledTimes(1));
  const firstId = mockAddNote.mock.calls[0][0].requestId;
  fireEvent.change(screen.getByLabelText('Add a private admin note'), { target: { value: 'Second note' } });
  resolveSave?.({});
  await waitFor(() => expect(screen.getByLabelText('Add a private admin note')).toHaveValue('Second note'));
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(mockAddNote).toHaveBeenCalledTimes(2));
  expect(mockAddNote.mock.calls[1][0]).toEqual(expect.objectContaining({ note: 'Second note' }));
  expect(mockAddNote.mock.calls[1][0].requestId).not.toBe(firstId);
});
