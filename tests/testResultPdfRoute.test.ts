import { GET as exportTestResultPdf } from '@/src/app/api/test-results/[attemptId]/pdf/route';

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
      this.headers = {
        get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
      };
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

const request = () => ({ json: async () => ({}), headers: new Map() }) as never;
const params = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });

describe('student test-result PDF route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyRequestAuth.mockResolvedValue({ uid: 'student-1', email: 'jane@school.edu' });
    mockGetSubmittedResult.mockResolvedValue({ attempt: { id: 'attempt-1' }, review: null });
    mockCreateSubmittedResultPdf.mockResolvedValue({
      bytes: new Uint8Array([37, 80, 68, 70]),
      filename: 'jane-doe-chapter-3-quiz-2026-09-19.pdf',
    });
  });

  it('requires authentication', async () => {
    mockVerifyRequestAuth.mockResolvedValueOnce(null);
    const response = (await exportTestResultPdf(request(), params('attempt-1'))) as unknown as { status: number };
    expect(response.status).toBe(401);
    expect(mockGetSubmittedResult).not.toHaveBeenCalled();
    expect(mockCreateSubmittedResultPdf).not.toHaveBeenCalled();
  });

  it('validates the attempt id before loading the result', async () => {
    const response = (await exportTestResultPdf(request(), params('not/a/valid/id'))) as unknown as {
      status: number;
      body: { code: string };
    };
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockGetSubmittedResult).not.toHaveBeenCalled();
  });

  it('loads only the authenticated student result and returns a PDF attachment', async () => {
    const response = (await exportTestResultPdf(request(), params('attempt-1'))) as unknown as {
      status: number;
      body: Uint8Array;
      headers: { get: (name: string) => string | null };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="jane-doe-chapter-3-quiz-2026-09-19.pdf"'
    );
    expect(Buffer.from(response.body).toString('utf8')).toBe('%PDF');
    expect(mockGetSubmittedResult).toHaveBeenCalledWith('attempt-1', 'student-1');
    expect(mockCreateSubmittedResultPdf).toHaveBeenCalledWith(
      { attempt: { id: 'attempt-1' }, review: null },
      { uid: 'student-1', email: 'jane@school.edu' }
    );
  });

  it('maps domain errors like ATTEMPT_NOT_FOUND to their status codes', async () => {
    mockGetSubmittedResult.mockRejectedValue(
      Object.assign(new Error('Test result not found'), { code: 'ATTEMPT_NOT_FOUND', status: 404 })
    );
    const response = (await exportTestResultPdf(request(), params('attempt-1'))) as unknown as {
      status: number;
      body: { code: string };
    };
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ATTEMPT_NOT_FOUND');
    expect(mockCreateSubmittedResultPdf).not.toHaveBeenCalled();
  });
});
