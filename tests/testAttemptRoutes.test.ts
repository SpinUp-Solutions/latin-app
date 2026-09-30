import { PATCH as saveAnswer } from '@/src/app/api/test-attempts/[attemptId]/answers/route';
import { POST as startAttempt } from '@/src/app/api/test-attempts/start/route';

const mockVerifyRequestAuth = jest.fn();
const mockStartAttempt = jest.fn();
const mockSaveAttemptAnswers = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyRequestAuth', () => ({
  verifyRequestAuth: (...args: unknown[]) => mockVerifyRequestAuth(...args),
}));

jest.mock('@/src/lib/tests/attempt-service', () => ({
  testAttemptService: {
    startAttempt: (...args: unknown[]) => mockStartAttempt(...args),
    saveAttemptAnswers: (...args: unknown[]) => mockSaveAttemptAnswers(...args),
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

  it('rejects the removed singular-answer payload', async () => {
    const response = (await saveAnswer(
      request({ exerciseId: 'fill.with.punctuation' }),
      params('attempt-1')
    )) as unknown as {
      status: number;
      body: { code: string };
    };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockSaveAttemptAnswers).not.toHaveBeenCalled();
  });

  it('validates and saves a coalesced answer batch', async () => {
    const input = {
      section: { pageId: 'page-1', expectedRevision: 0, mutationId: '9f0c2f5e-4d5b-4a8e-9a55-3c3f2a1b7c10' },
      answers: {
        'fill.one': { type: 'fill', answers: ['amo'] },
        'fill.two': null,
      },
    };
    mockSaveAttemptAnswers.mockResolvedValue({ id: 'attempt-1', answers: {} });

    const response = (await saveAnswer(request(input), params('attempt-1'))) as unknown as { status: number };

    expect(response.status).toBe(200);
    expect(mockSaveAttemptAnswers).toHaveBeenCalledWith('attempt-1', input, 'student-1');
  });
});
