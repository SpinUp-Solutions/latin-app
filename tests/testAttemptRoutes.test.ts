import { GET as getAttempt } from '@/src/app/api/test-attempts/[attemptId]/route';
import { PATCH as saveAnswer } from '@/src/app/api/test-attempts/[attemptId]/answers/route';
import { POST as startAttempt } from '@/src/app/api/test-attempts/start/route';

const mockVerifyRequestAuth = jest.fn();
const mockStartAttempt = jest.fn();
const mockGetAttempt = jest.fn();
const mockSaveAttemptAnswer = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {}, adminAuth: {} }));

jest.mock('@/src/lib/verifyRequestAuth', () => ({
  verifyRequestAuth: (...args: unknown[]) => mockVerifyRequestAuth(...args),
}));

jest.mock('@/src/lib/tests/service', () => ({
  testService: {
    startAttempt: (...args: unknown[]) => mockStartAttempt(...args),
    getAttempt: (...args: unknown[]) => mockGetAttempt(...args),
    saveAttemptAnswer: (...args: unknown[]) => mockSaveAttemptAnswer(...args),
  },
}));

const request = (body?: unknown) => ({ json: async () => body }) as never;
const params = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });

describe('student test-attempt routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyRequestAuth.mockResolvedValue({ uid: 'student-1' });
  });

  it('derives the student from authentication when starting an attempt', async () => {
    const input = { origin: { kind: 'normal-test', testId: 'test-1' } };
    mockStartAttempt.mockResolvedValue({ attempt: { id: 'attempt-1' }, resumed: false });

    const response = (await startAttempt(request(input))) as unknown as { status: number };

    expect(response.status).toBe(201);
    expect(mockStartAttempt).toHaveBeenCalledWith(input, 'student-1');
  });

  it('rejects unauthenticated and client-supplied identity data', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce(null);
    const unauthenticated = (await startAttempt(
      request({ origin: { kind: 'normal-test', testId: 'test-1' } })
    )) as unknown as { status: number };
    expect(unauthenticated.status).toBe(401);

    mockVerifyRequestAuth.mockResolvedValueOnce({ uid: 'student-1' });
    const clientIdentity = (await startAttempt(
      request({ studentId: 'student-2', origin: { kind: 'normal-test', testId: 'test-1' } })
    )) as unknown as { status: number; body: { code: string } };
    expect(clientIdentity.status).toBe(400);
    expect(clientIdentity.body.code).toBe('VALIDATION_ERROR');
    expect(mockStartAttempt).not.toHaveBeenCalled();
  });

  it('loads only the authenticated student attempt', async () => {
    mockGetAttempt.mockResolvedValue({ id: 'attempt-1', status: 'in-progress' });

    const response = (await getAttempt(request(), params('attempt-1'))) as unknown as {
      status: number;
      body: { attempt: { id: string } };
    };

    expect(response.status).toBe(200);
    expect(response.body.attempt.id).toBe('attempt-1');
    expect(mockGetAttempt).toHaveBeenCalledWith('attempt-1', 'student-1');
  });

  it('validates and saves one committed answer without accepting a student ID', async () => {
    const input = {
      exerciseId: 'fill.with.punctuation',
      answer: { type: 'fill', answers: ['amo'] },
    };
    mockSaveAttemptAnswer.mockResolvedValue({ id: 'attempt-1', answers: {} });

    const response = (await saveAnswer(request(input), params('attempt-1'))) as unknown as { status: number };

    expect(response.status).toBe(200);
    expect(mockSaveAttemptAnswer).toHaveBeenCalledWith('attempt-1', input, 'student-1');
  });

  it('requires an explicit answer value so clearing uses null rather than omission', async () => {
    const response = (await saveAnswer(
      request({ exerciseId: 'fill.with.punctuation' }),
      params('attempt-1')
    )) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockSaveAttemptAnswer).not.toHaveBeenCalled();
  });
});
