import { GET as getAttempt } from '@/src/app/api/test-attempts/[attemptId]/route';
import { PATCH as saveAnswer } from '@/src/app/api/test-attempts/[attemptId]/answers/route';
import { POST as submitAttempt } from '@/src/app/api/test-attempts/[attemptId]/submit/route';
import { POST as startAttempt } from '@/src/app/api/test-attempts/start/route';
import { GET as getSummaries } from '@/src/app/api/test-attempts/summaries/route';
import { POST as recoverSession } from '@/src/app/api/test-attempts/recover/route';
import { TestServiceError } from '@/src/lib/tests/errors';

const mockVerifyRequestAuth = jest.fn();
const mockStartAttempt = jest.fn();
const mockGetAttempt = jest.fn();
const mockSaveAttemptAnswer = jest.fn();
const mockSubmitAttempt = jest.fn();
const mockGetAttemptSummary = jest.fn();
const mockRecoverAttemptSession = jest.fn();

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
    submitAttempt: (...args: unknown[]) => mockSubmitAttempt(...args),
    getAttemptSummary: (...args: unknown[]) => mockGetAttemptSummary(...args),
    recoverAttemptSession: (...args: unknown[]) => mockRecoverAttemptSession(...args),
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

  it('submits only the authenticated student attempt', async () => {
    mockSubmitAttempt.mockResolvedValue({ attempt: { id: 'attempt-1', status: 'submitted' }, completionGranted: true });

    const response = (await submitAttempt(request(), params('attempt-1'))) as unknown as {
      status: number;
      body: { attempt: { id: string }; completionGranted: boolean };
    };

    expect(response.status).toBe(200);
    expect(response.body.attempt.id).toBe('attempt-1');
    expect(response.body.completionGranted).toBe(true);
    expect(mockSubmitAttempt).toHaveBeenCalledWith('attempt-1', 'student-1');
  });

  it('maps submission domain errors and rejects unauthenticated submits', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce(null);
    const unauthenticated = (await submitAttempt(request(), params('attempt-1'))) as unknown as { status: number };
    expect(unauthenticated.status).toBe(401);
    expect(mockSubmitAttempt).not.toHaveBeenCalled();

    mockSubmitAttempt.mockRejectedValueOnce(new TestServiceError('ATTEMPT_NOT_FOUND', 'Test attempt not found', 404));
    const missing = (await submitAttempt(request(), params('attempt-1'))) as unknown as {
      status: number;
      body: { code: string };
    };
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('ATTEMPT_NOT_FOUND');
  });

  it('returns origin summaries for the authenticated student', async () => {
    mockGetAttemptSummary.mockResolvedValue({ origin: { kind: 'normal-test', testId: 'test-1' }, attemptCount: 2 });
    const url = 'http://localhost/api/test-attempts/summaries?originKind=normal-test&originId=test-1';

    const response = (await getSummaries({ url } as never)) as unknown as {
      status: number;
      body: { summary: { attemptCount: number } };
    };

    expect(response.status).toBe(200);
    expect(response.body.summary.attemptCount).toBe(2);
    expect(mockGetAttemptSummary).toHaveBeenCalledWith({ kind: 'normal-test', testId: 'test-1' }, 'student-1');
  });

  it('rejects unauthenticated summary requests', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce(null);

    const response = (await getSummaries({
      url: 'http://localhost/api/test-attempts/summaries?originKind=normal-test&originId=test-1',
    } as never)) as unknown as { status: number };

    expect(response.status).toBe(401);
    expect(mockGetAttemptSummary).not.toHaveBeenCalled();
  });

  it('rejects invalid summary query parameters', async () => {
    const badKind = (await getSummaries({
      url: 'http://localhost/api/test-attempts/summaries?originKind=lesson&originId=test-1',
    } as never)) as unknown as { status: number; body: { code: string } };
    expect(badKind.status).toBe(400);
    expect(badKind.body.code).toBe('VALIDATION_ERROR');

    const missingId = (await getSummaries({
      url: 'http://localhost/api/test-attempts/summaries?originKind=normal-test',
    } as never)) as unknown as { status: number };
    expect(missingId.status).toBe(400);
    expect(mockGetAttemptSummary).not.toHaveBeenCalled();
  });

  it('recovers a trapped session scope for the authenticated student only', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce(null);
    const unauthenticated = (await recoverSession(
      request({ origin: { kind: 'normal-test', testId: 'test-1' } })
    )) as unknown as { status: number };
    expect(unauthenticated.status).toBe(401);
    expect(mockRecoverAttemptSession).not.toHaveBeenCalled();

    const input = { origin: { kind: 'normal-test', testId: 'test-1' } };
    mockRecoverAttemptSession.mockResolvedValue({ recovered: true });

    const response = (await recoverSession(request(input))) as unknown as {
      status: number;
      body: { recovered: boolean };
    };

    expect(response.status).toBe(200);
    expect(response.body.recovered).toBe(true);
    expect(mockRecoverAttemptSession).toHaveBeenCalledWith(input, 'student-1');

    const invalid = (await recoverSession(request({ studentId: 'student-2' }))) as unknown as {
      status: number;
      body: { code: string };
    };
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });
});
