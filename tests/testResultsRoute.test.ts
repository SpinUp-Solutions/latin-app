import { GET as getTestResult } from '@/src/app/api/test-results/[attemptId]/route';

const mockVerifyRequestAuth = jest.fn();
const mockGetSubmittedResult = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyRequestAuth', () => ({
  verifyRequestAuth: (...args: unknown[]) => mockVerifyRequestAuth(...args),
}));

jest.mock('@/src/lib/tests/attempt-service', () => ({
  testAttemptService: {
    getSubmittedResult: (...args: unknown[]) => mockGetSubmittedResult(...args),
  },
}));

const request = () => ({ json: async () => ({}), headers: new Map() }) as never;
const params = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });

describe('student test-result route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyRequestAuth.mockResolvedValue({ uid: 'student-1' });
  });

  it('requires authentication', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce(null);
    const response = (await getTestResult(request(), params('attempt-1'))) as unknown as { status: number };
    expect(response.status).toBe(401);
    expect(mockGetSubmittedResult).not.toHaveBeenCalled();
  });

  it('validates the attempt id before loading the result', async () => {
    const response = (await getTestResult(request(), params('not/a/valid/id'))) as unknown as {
      status: number;
      body: { code: string };
    };
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockGetSubmittedResult).not.toHaveBeenCalled();
  });

  it('loads only the authenticated student result', async () => {
    mockGetSubmittedResult.mockResolvedValue({ attempt: { id: 'attempt-1' }, review: null });
    const response = (await getTestResult(request(), params('attempt-1'))) as unknown as {
      status: number;
      body: { result: { attempt: { id: string }; review: null } };
    };

    expect(response.status).toBe(200);
    expect(response.body.result).toEqual({ attempt: { id: 'attempt-1' }, review: null });
    expect(mockGetSubmittedResult).toHaveBeenCalledWith('attempt-1', 'student-1');
  });

  it('maps domain errors like ATTEMPT_NOT_FOUND to their status codes', async () => {
    mockGetSubmittedResult.mockRejectedValue(
      Object.assign(new Error('Test result not found'), { code: 'ATTEMPT_NOT_FOUND', status: 404 })
    );
    const response = (await getTestResult(request(), params('attempt-1'))) as unknown as {
      status: number;
      body: { code: string };
    };
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ATTEMPT_NOT_FOUND');
  });
});
