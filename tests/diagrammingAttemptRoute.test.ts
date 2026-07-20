import { POST } from '@/src/app/api/diagramming-attempts/route';

const mockVerifyIdToken = jest.fn();
const mockGetAttempt = jest.fn();
const mockAddAudit = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ toDate: () => new Date('2026-07-20T12:00:00.000Z') }),
  },
}));

jest.mock('@/src/services/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
  },
  adminDb: {
    collection: (name: string) => {
      if (name === 'testAttempts') {
        return {
          doc: (id: string) => ({
            get: () => mockGetAttempt(id),
          }),
        };
      }
      if (name === 'diagramming_attempts') {
        return { add: (value: unknown) => mockAddAudit(value) };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
  },
}));

const span = {
  startTokenIndex: 0,
  endTokenIndex: 0,
  startCharOffset: 0,
  endCharOffset: 4,
};
const solutionAnnotation = { id: 'verb:0:0-0:4', kind: 'verb', span };

const storedAttempt = (studentId = 'student-1') => ({
  studentId,
  versionId: 'version-1',
  passingPercentage: 70,
  origin: { kind: 'normal-test', testId: 'test-1' },
  status: 'in-progress',
  answers: {},
  deliveryState: {
    versionId: 'version-1',
    pages: [
      {
        id: 'page-1',
        items: [
          {
            id: 'diagram-1',
            type: 'sentence-diagramming',
            title: 'Diagram',
            instructions: '',
            maxPoints: 1,
            feedbackConfig: { escalationLevels: [] },
            data: {
              latin: 'amat',
              translation: 'he loves',
              tokens: [{ id: 'token-0', text: 'amat', index: 0 }],
              solutionAnnotations: [solutionAnnotation],
              availableStudentTools: ['verb'],
              hint: { text: '', tokens: [], annotations: [] },
              explanation: { text: '', tokens: [], annotations: [] },
              difficulty: 'beginner',
            },
          },
        ],
      },
    ],
    resolvedExercises: {},
  },
  startedAt: '2026-07-20T11:00:00.000Z',
  updatedAt: '2026-07-20T11:00:00.000Z',
});

const request = (body: unknown) =>
  ({
    headers: { get: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : null) },
    json: async () => body,
  }) as never;

describe('diagramming attempt audit route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockVerifyIdToken.mockResolvedValue({ uid: 'student-1' });
    mockGetAttempt.mockResolvedValue({
      id: 'attempt-1',
      exists: true,
      data: () => storedAttempt(),
    });
    mockAddAudit.mockResolvedValue({ id: 'audit-1' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compares raw test annotations against the authenticated frozen attempt solution', async () => {
    const response = (await POST(
      request({
        attemptId: 'attempt-1',
        exerciseId: 'diagram-1',
        studentAnnotations: [solutionAnnotation],
        appVersion: 'test-version',
      })
    )) as unknown as { status: number; body: { id: string } };

    expect(response).toEqual({ status: 201, body: { id: 'audit-1' } });
    expect(mockGetAttempt).toHaveBeenCalledWith('attempt-1');
    expect(mockAddAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: 'test-attempt',
        testAttemptId: 'attempt-1',
        testOrigin: { kind: 'normal-test', testId: 'test-1' },
        testVersionId: 'version-1',
        exerciseId: 'diagram-1',
        pageIndex: 0,
        itemIndex: 0,
        userId: 'student-1',
        rawStudentAnnotations: [solutionAnnotation],
        rawSolutionAnnotations: [solutionAnnotation],
        matched: 1,
        expected: 1,
        isComplete: true,
      })
    );
  });

  it('does not expose another student attempt through the audit endpoint', async () => {
    mockGetAttempt.mockResolvedValue({
      id: 'attempt-1',
      exists: true,
      data: () => storedAttempt('student-2'),
    });

    const response = (await POST(
      request({
        attemptId: 'attempt-1',
        exerciseId: 'diagram-1',
        studentAnnotations: [solutionAnnotation],
      })
    )) as unknown as { status: number };

    expect(response.status).toBe(404);
    expect(mockAddAudit).not.toHaveBeenCalled();
  });

  it('rejects malformed raw annotations before reading the frozen attempt', async () => {
    const response = (await POST(
      request({
        attemptId: 'attempt-1',
        exerciseId: 'diagram-1',
        studentAnnotations: [{ ...solutionAnnotation, kind: 'not-a-real-kind' }],
      })
    )) as unknown as { status: number };

    expect(response.status).toBe(400);
    expect(mockGetAttempt).not.toHaveBeenCalled();
    expect(mockAddAudit).not.toHaveBeenCalled();
  });
});
