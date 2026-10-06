import { GET as getTestResult } from '@/src/app/api/test-results/[attemptId]/route';
import { GET as exportTestResultPdf } from '@/src/app/api/test-results/[attemptId]/pdf/route';
import { TestServiceError } from '@/src/lib/tests/errors';

const mockVerifyRequestAuth = jest.fn();
const mockGetSubmittedResult = jest.fn();
const mockCreateSubmittedResultPdf = jest.fn();

jest.mock('next/server', () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: { get: (name: string) => string | null };
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      const headers = init?.headers ?? {};
      this.headers = { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null };
    }
    static json(body: unknown, init?: { status?: number }) {
      return new MockNextResponse(body, init);
    }
  }
  return { NextResponse: MockNextResponse };
});

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyRequestAuth', () => ({
  verifyRequestAuth: (...args: unknown[]) => mockVerifyRequestAuth(...args),
}));

jest.mock('@/src/lib/tests/attempt-service', () => ({
  testAttemptService: {
    getSubmittedResult: (...args: unknown[]) => mockGetSubmittedResult(...args),
  },
}));

jest.mock('@/src/lib/tests/result-pdf.server', () => ({
  createSubmittedResultPdf: (...args: unknown[]) => mockCreateSubmittedResultPdf(...args),
}));

type RouteResponse = {
  status: number;
  body: unknown;
  headers: { get: (name: string) => string | null };
};

const result = { attempt: { id: 'attempt-1' }, review: null };
const call = (handler: typeof getTestResult | typeof exportTestResultPdf, attemptId = 'attempt-1') =>
  handler({ json: async () => ({}), headers: new Map() } as never, {
    params: Promise.resolve({ attemptId }),
  }) as unknown as Promise<RouteResponse>;

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyRequestAuth.mockResolvedValue({ uid: 'student-1', email: 'jane@school.edu' });
  mockGetSubmittedResult.mockResolvedValue(result);
  mockCreateSubmittedResultPdf.mockResolvedValue({
    bytes: new Uint8Array([37, 80, 68, 70]),
    filename: 'jane-doe-chapter-3-quiz-2026-09-19.pdf',
  });
});

describe.each([
  ['result', getTestResult],
  ['result PDF', exportTestResultPdf],
])('student test-%s route', (_name, handler) => {
  it('requires authentication', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce(null);

    expect((await call(handler)).status).toBe(401);
    expect(mockGetSubmittedResult).not.toHaveBeenCalled();
    expect(mockCreateSubmittedResultPdf).not.toHaveBeenCalled();
  });

  it('validates the attempt id before loading the result', async () => {
    const response = await call(handler, 'not/a/valid/id');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(mockGetSubmittedResult).not.toHaveBeenCalled();
  });

  it('maps domain errors like ATTEMPT_NOT_FOUND to their status codes', async () => {
    mockGetSubmittedResult.mockRejectedValue(new TestServiceError('ATTEMPT_NOT_FOUND', 'Test result not found', 404));

    const response = await call(handler);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
    expect(mockCreateSubmittedResultPdf).not.toHaveBeenCalled();
  });
});

it('loads only the authenticated student result', async () => {
  const response = await call(getTestResult);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ result });
  expect(mockGetSubmittedResult).toHaveBeenCalledWith('attempt-1', 'student-1');
});

it('returns the authenticated student result as a PDF attachment', async () => {
  const response = await call(exportTestResultPdf);

  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('application/pdf');
  expect(response.headers.get('Content-Disposition')).toBe(
    'attachment; filename="jane-doe-chapter-3-quiz-2026-09-19.pdf"'
  );
  expect(Buffer.from(response.body as Uint8Array).toString('utf8')).toBe('%PDF');
  expect(mockGetSubmittedResult).toHaveBeenCalledWith('attempt-1', 'student-1');
  expect(mockCreateSubmittedResultPdf).toHaveBeenCalledWith(result, { uid: 'student-1', email: 'jane@school.edu' });
});
