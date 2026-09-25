const verifyToken = jest.fn();
const verifyAdmin = jest.fn();
const submitFeedback = jest.fn();
const createFeedbackSession = jest.fn();
const getPublicFeedbackSession = jest.fn();
const listAccessibleFeedbackLessons = jest.fn();
const listFeedback = jest.fn();
const countFeedback = jest.fn();
const getAdminFeedback = jest.fn();
const getCurrentFeedbackLesson = jest.fn();
const updateFeedbackState = jest.fn();
const addPrivateFeedbackNote = jest.fn();
const listFeedbackActivity = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyRequestAuth', () => ({ verifyRequestAuth: (...args: unknown[]) => verifyToken(...args) }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({ verifyAdminAccess: (...args: unknown[]) => verifyAdmin(...args) }));
jest.mock('@/src/lib/student-feedback/service.server', () => ({
  submitFeedback: (...args: unknown[]) => submitFeedback(...args),
  createFeedbackSession: (...args: unknown[]) => createFeedbackSession(...args),
  getPublicFeedbackSession: (...args: unknown[]) => getPublicFeedbackSession(...args),
}));
jest.mock('@/src/lib/student-feedback/lessons.server', () => ({
  listAccessibleFeedbackLessons: (...args: unknown[]) => listAccessibleFeedbackLessons(...args),
}));
jest.mock('@/src/lib/student-feedback/admin.server', () => ({
  listFeedback: (...args: unknown[]) => listFeedback(...args),
  countFeedback: (...args: unknown[]) => countFeedback(...args),
  getAdminFeedback: (...args: unknown[]) => getAdminFeedback(...args),
  getCurrentFeedbackLesson: (...args: unknown[]) => getCurrentFeedbackLesson(...args),
  updateFeedbackState: (...args: unknown[]) => updateFeedbackState(...args),
  addPrivateFeedbackNote: (...args: unknown[]) => addPrivateFeedbackNote(...args),
  listFeedbackActivity: (...args: unknown[]) => listFeedbackActivity(...args),
}));

import { POST as submit } from '@/src/app/api/feedback/route';
import { GET as lessons } from '@/src/app/api/feedback/lessons/route';
import { POST as createSession } from '@/src/app/api/feedback/sessions/route';
import { GET as getSession } from '@/src/app/api/feedback/sessions/[sessionId]/route';
import { GET as adminList } from '@/src/app/api/admin/feedback/route';
import { GET as adminCount } from '@/src/app/api/admin/feedback/count/route';
import { GET as adminDetail } from '@/src/app/api/admin/feedback/[feedbackId]/route';
import { PATCH as adminState } from '@/src/app/api/admin/feedback/[feedbackId]/state/route';
import { POST as adminNote } from '@/src/app/api/admin/feedback/[feedbackId]/notes/route';
import { GET as adminActivity } from '@/src/app/api/admin/feedback/[feedbackId]/activity/route';
import { FeedbackError, feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';

const sessionId = '08814ab5-2712-49e9-9c54-7c7317fdd812';
const request = (body?: unknown, query = '') => ({
  json: async () => body,
  nextUrl: { searchParams: new URLSearchParams(query) },
}) as never;
const context = { params: Promise.resolve({ feedbackId: sessionId, sessionId }) };
const input = {
  sessionId, type: 'general', areas: ['dashboard'], description: 'Progress text is unclear',
  attachmentIds: [], diagnostics: { entryPoint: 'standalone' },
};

describe('student feedback API authorization and validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyToken.mockResolvedValue({ uid: 'student-1', firebase: { sign_in_provider: 'password' } });
    verifyAdmin.mockResolvedValue({ uid: 'admin-1' });
    submitFeedback.mockResolvedValue({ feedbackId: sessionId, submittedAt: '2026-09-24T12:00:00.000Z' });
    createFeedbackSession.mockResolvedValue({});
    getPublicFeedbackSession.mockResolvedValue({ id: sessionId, status: 'open', expiresAtMs: 1, receipt: null, attachments: [] });
    listAccessibleFeedbackLessons.mockResolvedValue([]);
    listFeedback.mockResolvedValue({ items: [], nextCursor: null });
    countFeedback.mockResolvedValue(0);
    getAdminFeedback.mockResolvedValue({ id: sessionId, lesson: null });
    getCurrentFeedbackLesson.mockResolvedValue(null);
    updateFeedbackState.mockResolvedValue({ id: sessionId, stateRevision: 1 });
    addPrivateFeedbackNote.mockResolvedValue({ id: sessionId });
    listFeedbackActivity.mockResolvedValue({ items: [], nextCursor: null });
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

  it('accepts authenticated nonstudent roles, derives actor, and rejects client identity spoofing', async () => {
    const teacher = { uid: 'teacher-1', firebase: { sign_in_provider: 'password' } };
    verifyToken.mockResolvedValueOnce(teacher);
    expect((await submit(request(input))).status).toBe(201);
    expect(submitFeedback).toHaveBeenCalledWith(teacher, expect.objectContaining({ description: input.description }));
    expect((await submit(request({ ...input, submitterUid: 'someone-else' }))).status).toBe(400);
    expect(submitFeedback).toHaveBeenCalledTimes(1);
  });

  it('validates session IDs and passes verified UID to session ownership services', async () => {
    expect((await createSession(request({ sessionId }))).status).toBe(201);
    expect(createFeedbackSession).toHaveBeenCalledWith('student-1', sessionId);
    expect((await getSession(request(), context)).status).toBe(200);
    expect(getPublicFeedbackSession).toHaveBeenCalledWith('student-1', sessionId);
    expect((await getSession(request(), { params: Promise.resolve({ sessionId: '../bad' }) })).status).toBe(400);
  });

  it('guards every owned admin feedback route before accessing report data', async () => {
    verifyAdmin.mockRejectedValue(new FeedbackError('FEEDBACK_FORBIDDEN', 'Forbidden', 403));
    const routes = [
      () => adminList(request()),
      () => adminCount(request()),
      () => adminDetail(request(), context),
      () => adminState(request({ action: 'resolve', expectedRevision: 0 }), context),
      () => adminNote(request({ requestId: sessionId, note: 'Private' }), context),
      () => adminActivity(request(), context),
    ];
    for (const call of routes) expect((await call()).status).toBe(403);
    expect(verifyAdmin).toHaveBeenCalledTimes(routes.length);
    for (const service of [listFeedback, countFeedback, getAdminFeedback, updateFeedbackState, addPrivateFeedbackNote, listFeedbackActivity]) {
      expect(service).not.toHaveBeenCalled();
    }
  });

  it('applies admin list defaults and passes verified actor to state and notes', async () => {
    expect((await adminList(request())).status).toBe(200);
    expect(listFeedback).toHaveBeenCalledWith(expect.objectContaining({ status: 'unresolved', archived: 'false', sort: 'newest' }));
    expect((await adminState(request({ action: 'resolve', expectedRevision: 0 }), context)).status).toBe(200);
    expect(updateFeedbackState).toHaveBeenCalledWith(sessionId, { uid: 'admin-1' }, { action: 'resolve', expectedRevision: 0 });
    expect((await adminNote(request({ requestId: sessionId, note: 'Private' }), context)).status).toBe(201);
    expect(addPrivateFeedbackNote).toHaveBeenCalledWith(sessionId, { uid: 'admin-1' }, { requestId: sessionId, note: 'Private' });
  });

  it('never logs or reflects raw unexpected SDK messages containing credentials or private metadata', () => {
    const privateValue = 'token=private123&studentEmail=hidden@example.edu';
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = feedbackRouteErrorResponse(Object.assign(new Error(privateValue), { status: 503, code: 'SDK_FAILURE' }), 'load feedback') as unknown as {
        status: number; body: { error: string; code?: string };
      };
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain(privateValue);
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateValue);
      expect(response.body).toEqual({ error: 'Failed to load feedback' });
    } finally {
      log.mockRestore();
    }
  });
});
