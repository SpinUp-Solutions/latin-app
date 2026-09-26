import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedbackList } from '@/src/components/admin/feedback/FeedbackList';
import { FeedbackDetail } from '@/src/components/admin/feedback/FeedbackDetail';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockUpdate = jest.fn();
const mockAddNote = jest.fn();
let mockSearch = 'status=resolved&sort=oldest';
const reportId = 'a5361411-a326-4845-8465-259154c05e14';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/src/store/hooks', () => ({ useAppDispatch: () => jest.fn() }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/src/store/api/studentFeedbackApi', () => ({
  useGetAdminFeedbackListQuery: () => ({
    currentData: {
      items: [
        {
          id: reportId,
          type: 'bug_report',
          severity: 'blocking',
          areas: ['lessons'],
          excerpt: '<script>alert(1)</script>',
          submitter: { uid: 'student-1', displayName: 'Ada Lovelace', email: 'ada@example.edu', emailNormalized: 'ada@example.edu' },
          lesson: { id: 'lesson-1', title: '<strong>First lesson</strong>', pageId: 'page-1', pageIndex: 0, pageTitle: null },
          createdAt: '2026-09-24T10:00:00.000Z',
          status: 'resolved',
          archived: false,
          attachmentCount: 2,
        },
      ],
      nextCursor: null,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useGetAdminFeedbackCountQuery: () => ({ data: { count: 2 }, refetch: jest.fn() }),
  useGetAdminFeedbackDetailQuery: () => ({
    data: {
      feedback: {
        id: reportId,
        type: 'bug_report',
        severity: 'minor',
        areas: ['lessons'],
        description: 'The audio stops',
        submitter: { uid: 'student-1', displayName: 'Ada Lovelace', email: 'ada@example.edu', emailNormalized: 'ada@example.edu' },
        lesson: { id: 'lesson-1', title: '<strong>Old lesson</strong>', pageId: 'page-1', pageIndex: 0, pageTitle: 'Original page' },
        attachments: [],
        diagnostics: { entryPoint: 'lesson', browser: 'Browser', route: '/lesson/lesson-1', viewport: { width: 390, height: 844 } },
        createdAt: '2026-09-24T10:00:00.000Z',
        updatedAt: '2026-09-24T10:00:00.000Z',
        status: 'unresolved',
        archived: false,
      },
      activity: [
        { id: 'submitted', kind: 'submitted', actorUid: 'student-1', actorDisplayName: 'Ada Lovelace', createdAt: '2026-09-24T10:00:00.000Z', reason: null, note: null },
      ],
      currentLesson: { id: 'lesson-1', title: '<strong>Current lesson</strong>' },
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useGetAdminFeedbackAttachmentsQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() }),
  useUpdateAdminFeedbackStateMutation: () => [mockUpdate, { isLoading: false }],
  useAddAdminFeedbackNoteMutation: () => [mockAddNote, { isLoading: false }],
  refreshFeedbackListPageOne: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = 'status=resolved&sort=oldest';
  mockUpdate.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mockAddNote.mockReturnValue({ unwrap: () => Promise.resolve({}) });
});

test('list keeps filters in detail links and renders student text as text', () => {
  render(<FeedbackList />);
  expect(screen.getByRole('heading', { name: 'Feedback' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Resolved' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /Open\s*2/ })).toBeInTheDocument();
  const row = screen.getByRole('link', { name: /Bug report/ });
  expect(row).toHaveAttribute('href', expect.stringContaining(encodeURIComponent('/admin/feedback?status=resolved&sort=oldest')));
  expect(row).toHaveTextContent('Blocking');
  expect(row).toHaveTextContent('First lesson');
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
});

test('search finds a student by email or UID, or opens a report by ID', () => {
  render(<FeedbackList />);
  const search = screen.getByLabelText('Find by student email, student UID or report ID');
  fireEvent.change(search, { target: { value: ' Ada@Example.edu ' } });
  fireEvent.submit(search.closest('form')!);
  expect(mockReplace).toHaveBeenLastCalledWith(expect.stringContaining('submitterEmail=Ada%40Example.edu'), { scroll: false });

  fireEvent.change(search, { target: { value: 'student-1' } });
  fireEvent.submit(search.closest('form')!);
  expect(mockReplace).toHaveBeenLastCalledWith(expect.stringContaining('submitterUid=student-1'), { scroll: false });

  fireEvent.change(search, { target: { value: reportId.toUpperCase() } });
  fireEvent.submit(search.closest('form')!);
  expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^/admin/feedback/${reportId}\\?return=`)));
});

test('status tabs and filter chips update the URL', () => {
  mockSearch = 'status=all&lessonId=lesson-1';
  render(<FeedbackList />);
  fireEvent.click(screen.getByRole('button', { name: /Open/ }));
  expect(mockReplace).toHaveBeenLastCalledWith('/admin/feedback?lessonId=lesson-1', { scroll: false });
  expect(screen.getByText(/Lesson:/)).toHaveTextContent('First lesson');
  fireEvent.click(screen.getByRole('button', { name: 'Remove filter' }));
  expect(mockReplace).toHaveBeenLastCalledWith('/admin/feedback?status=all', { scroll: false });
});

test('detail shows lesson history and review actions', async () => {
  mockSearch = `return=${encodeURIComponent('/admin/feedback?status=resolved&sort=oldest')}`;
  render(<FeedbackDetail feedbackId={reportId} />);
  expect(screen.getByText('Old lesson')).toBeInTheDocument();
  expect(screen.getByText('Current lesson')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Preview lesson' })).toHaveAttribute('href', '/admin/lessons/preview/lesson-1');
  expect(screen.getByRole('link', { name: 'All feedback' })).toHaveAttribute('href', '/admin/feedback?status=resolved&sort=oldest');
  expect(screen.getByRole('link', { name: /All feedback from this student/ })).toHaveAttribute(
    'href',
    '/admin/feedback?status=all&submitterUid=student-1'
  );

  fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: ' Fixed in 2.3 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith({ feedbackId: reportId, action: 'resolve', reason: 'Fixed in 2.3' })
  );
  await waitFor(() => expect(screen.getByLabelText('Reason (optional)')).toHaveValue(''));
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  await waitFor(() => expect(mockUpdate).toHaveBeenLastCalledWith({ feedbackId: reportId, action: 'archive' }));
});

test('a note typed while an earlier note is saving is kept', async () => {
  let finishSave: ((value: unknown) => void) | undefined;
  mockAddNote.mockReturnValue({ unwrap: () => new Promise(resolve => (finishSave = resolve)) });
  render(<FeedbackDetail feedbackId={reportId} />);
  const note = screen.getByLabelText('Private note');
  fireEvent.change(note, { target: { value: 'First note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect(mockAddNote).toHaveBeenCalledWith({ feedbackId: reportId, note: 'First note' }));
  fireEvent.change(note, { target: { value: 'Second note' } });
  finishSave?.({});
  await waitFor(() => expect(note).toHaveValue('Second note'));
});
