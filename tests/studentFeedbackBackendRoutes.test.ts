const verifyToken = jest.fn();
const verifyAdmin = jest.fn();
const submitFeedback = jest.fn();
const listAccessibleFeedbackLessons = jest.fn();
const listFeedback = jest.fn();
const countOpenFeedback = jest.fn();
const getFeedbackDetail = jest.fn();
const getFeedbackReport = jest.fn();
const updateFeedbackState = jest.fn();
const addFeedbackNote = jest.fn();
const getFeedbackAttachmentLinks = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyRequestAuth', () => ({ verifyRequestAuth: (...args: unknown[]) => verifyToken(...args) }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({ verifyAdminAccess: (...args: unknown[]) => verifyAdmin(...args) }));
jest.mock('@/src/lib/student-feedback/service.server', () => ({
  submitFeedback: (...args: unknown[]) => submitFeedback(...args),
}));
jest.mock('@/src/lib/student-feedback/lessons.server', () => ({
  listAccessibleFeedbackLessons: (...args: unknown[]) => listAccessibleFeedbackLessons(...args),
}));
jest.mock('@/src/lib/student-feedback/admin.server', () => ({
  listFeedback: (...args: unknown[]) => listFeedback(...args),
  countOpenFeedback: (...args: unknown[]) => countOpenFeedback(...args),
  getFeedbackDetail: (...args: unknown[]) => getFeedbackDetail(...args),
  getFeedbackReport: (...args: unknown[]) => getFeedbackReport(...args),
  updateFeedbackState: (...args: unknown[]) => updateFeedbackState(...args),
  addFeedbackNote: (...args: unknown[]) => addFeedbackNote(...args),
}));
jest.mock('@/src/lib/student-feedback/attachments.server', () => ({
  getFeedbackAttachmentLinks: (...args: unknown[]) => getFeedbackAttachmentLinks(...args),
}));

import { POST as submit } from '@/src/app/api/feedback/route';
import { GET as lessons } from '@/src/app/api/feedback/lessons/route';
import { GET as adminList } from '@/src/app/api/admin/feedback/route';
import { GET as adminCount } from '@/src/app/api/admin/feedback/count/route';
import { GET as adminDetail } from '@/src/app/api/admin/feedback/[feedbackId]/route';
import { PATCH as adminState } from '@/src/app/api/admin/feedback/[feedbackId]/state/route';
import { POST as adminNote } from '@/src/app/api/admin/feedback/[feedbackId]/notes/route';
import { GET as adminAttachments } from '@/src/app/api/admin/feedback/[feedbackId]/attachments/route';
import { FeedbackError, feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';

const feedbackId = '08814ab5-2712-49e9-9c54-7c7317fdd812';
const request = (body?: unknown, query = '') =>
  ({ json: async () => body, nextUrl: { searchParams: new URLSearchParams(query) } }) as never;
const context = { params: Promise.resolve({ feedbackId }) };
const input = {
  draftId: feedbackId,
  type: 'general',
  areas: ['dashboard'],
  description: 'Progress text is unclear',
  attachments: [],
  diagnostics: { entryPoint: 'standalone' },
};

describe('student feedback API authorization and validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyToken.mockResolvedValue({ uid: 'student-1', firebase: { sign_in_provider: 'password' } });
    verifyAdmin.mockResolvedValue({ uid: 'admin-1' });
    submitFeedback.mockResolvedValue({ feedbackId, submittedAt: '2026-09-24T12:00:00.000Z' });
    listAccessibleFeedbackLessons.mockResolvedValue([]);
    listFeedback.mockResolvedValue({ items: [], nextCursor: null });
    countOpenFeedback.mockResolvedValue(3);
    getFeedbackDetail.mockResolvedValue({ feedback: { id: feedbackId }, activity: [], currentLesson: null });
    getFeedbackReport.mockResolvedValue({ id: feedbackId, attachments: [] });
    updateFeedbackState.mockResolvedValue({ id: feedbackId });
    addFeedbackNote.mockResolvedValue({ id: 'note-1' });
    getFeedbackAttachmentLinks.mockResolvedValue({ items: [], expiresAt: '2026-09-24T12:15:00.000Z' });
  });

  it('rejects missing and anonymous Firebase Auth tokens before student service calls', async () => {
    for (const actor of [null, { uid: 'anonymous-1', firebase: { sign_in_provider: 'anonymous' } }]) {
      verifyToken.mockResolvedValueOnce(actor);
      expect((await submit(request(input))).status).toBe(401);
    }
    expect(submitFeedback).not.toHaveBeenCalled();
    verifyToken.mockResolvedValueOnce(null);
    expect((await lessons(request())).status).toBe(401);
    expect(listAccessibleFeedbackLessons).not.toHaveBeenCalled();
  });

  it('passes the verified actor to the submit service and validates the body', async () => {
    expect((await submit(request(input))).status).toBe(201);
    expect(submitFeedback).toHaveBeenCalledWith(
      { uid: 'student-1', firebase: { sign_in_provider: 'password' } },
      expect.objectContaining({ description: input.description })
    );
    expect((await submit(request({ ...input, draftId: '../bad' }))).status).toBe(400);
    expect(submitFeedback).toHaveBeenCalledTimes(1);
  });

  it('guards every admin feedback route before accessing report data', async () => {
    verifyAdmin.mockRejectedValue(new FeedbackError('FEEDBACK_FORBIDDEN', 'Forbidden', 403));
    const routes = [
      () => adminList(request()),
      () => adminCount(request()),
      () => adminDetail(request(), context),
      () => adminState(request({ action: 'resolve' }), context),
      () => adminNote(request({ note: 'Private' }), context),
      () => adminAttachments(request(), context),
    ];
    for (const call of routes) expect((await call()).status).toBe(403);
    expect(verifyAdmin).toHaveBeenCalledTimes(routes.length);
    for (const service of [listFeedback, countOpenFeedback, getFeedbackDetail, getFeedbackReport, updateFeedbackState, addFeedbackNote]) {
      expect(service).not.toHaveBeenCalled();
    }
  });

  it('applies list defaults, validates report IDs and passes the verified admin to writes', async () => {
    expect((await adminList(request())).status).toBe(200);
    expect(listFeedback).toHaveBeenCalledWith(expect.objectContaining({ status: 'unresolved', archived: 'false', sort: 'newest' }));
    expect((await adminList(request(undefined, 'area=nonsense'))).status).toBe(400);
    expect((await adminDetail(request(), { params: Promise.resolve({ feedbackId: '../bad' }) })).status).toBe(400);
    expect((await adminState(request({ action: 'resolve', reason: '  Fixed  ' }), context)).status).toBe(200);
    expect(updateFeedbackState).toHaveBeenCalledWith(feedbackId, { uid: 'admin-1' }, { action: 'resolve', reason: 'Fixed' });
    expect((await adminNote(request({ note: '  Private  ' }), context)).status).toBe(201);
    expect(addFeedbackNote).toHaveBeenCalledWith(feedbackId, { uid: 'admin-1' }, 'Private');
    expect((await adminNote(request({ note: '   ' }), context)).status).toBe(400);
  });

  it('signs attachment links only for an existing report and disables caching', async () => {
    const response = (await adminAttachments(request(), context)) as unknown as { status: number; headers?: Record<string, string> };
    expect(response.status).toBe(200);
    expect(getFeedbackReport).toHaveBeenCalledWith(feedbackId);
    expect(getFeedbackAttachmentLinks).toHaveBeenCalledWith({ id: feedbackId, attachments: [] });
  });

  it('never reflects raw unexpected SDK messages containing credentials or private metadata', () => {
    const privateValue = 'token=private123&studentEmail=hidden@example.edu';
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = feedbackRouteErrorResponse(
        Object.assign(new Error(privateValue), { status: 503, code: 'SDK_FAILURE' }),
        'load feedback'
      ) as unknown as { status: number; body: { error: string } };
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain(privateValue);
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateValue);
    } finally {
      log.mockRestore();
    }
  });
});
