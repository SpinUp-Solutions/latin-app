import { GET } from '@/src/app/api/test-attempts/[attemptId]/route';
import { PATCH } from '@/src/app/api/test-attempts/[attemptId]/sections/[pageId]/route';
import { POST } from '@/src/app/api/test-attempts/[attemptId]/sections/[pageId]/confirm/route';
import { TestServiceError } from '@/src/lib/tests/errors';
const mockAuth = jest.fn();
const mockRead = jest.fn();
const mockPhase = jest.fn();
const mockConfirm = jest.fn();
jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyRequestAuth', () => ({ verifyRequestAuth: (...args: unknown[]) => mockAuth(...args) }));
jest.mock('@/src/lib/tests/attempt-service', () => ({
  testAttemptService: {
    getAttempt: (...args: unknown[]) => mockRead(...args),
    setSectionPhase: (...args: unknown[]) => mockPhase(...args),
    confirmSection: (...args: unknown[]) => mockConfirm(...args),
  },
}));
const confirmation = {
  expectedRevision: 0,
  requestId: '00000000-0000-4000-8000-000000000001',
  acknowledgeIncomplete: true,
};
const request = (body: unknown = confirmation) => ({ json: async () => body }) as never;
const params = { params: Promise.resolve({ attemptId: 'attempt-1', pageId: 'page-1' }) };
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ uid: 'student-1' });
});
it.each([GET, PATCH, POST])('authenticates before accessing an attempt', async handler => {
  mockAuth.mockResolvedValue(null);
  expect(await handler(request(), params)).toMatchObject({ status: 401 });
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockPhase).not.toHaveBeenCalled();
  expect(mockConfirm).not.toHaveBeenCalled();
});
it('derives ownership from the verified token for all section operations', async () => {
  const input = { expectedRevision: 1, phase: 'review' };
  mockRead.mockResolvedValue({ id: 'attempt-1' });
  mockPhase.mockResolvedValue({ id: 'attempt-1' });
  await GET(request(), params);
  await PATCH(request(input), params);
  expect(mockRead).toHaveBeenCalledWith('attempt-1', 'student-1');
  expect(mockPhase).toHaveBeenCalledWith('attempt-1', 'page-1', input, 'student-1');
});
it('returns 202 only while confirmation is pending', async () => {
  mockConfirm
    .mockResolvedValueOnce({ attempt: { id: 'attempt-1' }, pending: true, retryAfterMs: 2000 })
    .mockResolvedValueOnce({ attempt: { status: 'submitted' }, pending: false });
  expect(await POST(request(), params)).toMatchObject({ status: 202, body: { pending: true } });
  expect(await POST(request(), params)).toMatchObject({ status: 200, body: { pending: false } });
  expect(mockConfirm).toHaveBeenCalledWith('attempt-1', 'page-1', confirmation, 'student-1');
});
it.each([GET, PATCH, POST])('rejects malformed route IDs before calling a service', async handler => {
  expect(
    await handler(request(), { params: Promise.resolve({ attemptId: 'bad/id', pageId: 'page-1' }) })
  ).toMatchObject({ status: 400 });
});
it('maps section conflicts without leaking internal grading details', async () => {
  mockConfirm.mockRejectedValue(new TestServiceError('ATTEMPT_REVISION_CONFLICT', 'Reload saved answers', 409));
  expect(await POST(request(), params)).toMatchObject({
    status: 409,
    body: { code: 'ATTEMPT_REVISION_CONFLICT', error: 'Reload saved answers' },
  });
});
