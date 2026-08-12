import { PATCH as saveAnswer } from '@/src/app/api/test-attempts/[attemptId]/answers/route';
import { POST as gradeTranslation } from '@/src/app/api/test-attempts/[attemptId]/translation-grade/route';
import { POST as submitAttempt } from '@/src/app/api/test-attempts/[attemptId]/submit/route';
import { POST as startAttempt } from '@/src/app/api/test-attempts/start/route';
import { TestServiceError } from '@/src/lib/tests/errors';

const mockVerifyRequestAuth = jest.fn();
const mockStartAttempt = jest.fn();
const mockSaveAttemptAnswers = jest.fn();
const mockGradeTranslationItem = jest.fn();
const mockSubmitAttempt = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyRequestAuth', () => ({
  verifyRequestAuth: (...args: unknown[]) => mockVerifyRequestAuth(...args),
}));

jest.mock('@/src/lib/tests/attempt-service', () => ({
  testAttemptService: {
    startAttempt: (...args: unknown[]) => mockStartAttempt(...args),
    saveAttemptAnswers: (...args: unknown[]) => mockSaveAttemptAnswers(...args),
    gradeTranslationItem: (...args: unknown[]) => mockGradeTranslationItem(...args),
    submitAttempt: (...args: unknown[]) => mockSubmitAttempt(...args),
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

  it('grades and persists a translation item for the authenticated student', async () => {
    const input = {
      exerciseId: 'translation.one',
      itemIndex: 0,
      userTranslation: 'The girl sings.',
    };
    mockGradeTranslationItem.mockResolvedValue({
      id: 'attempt-1',
      translationGrades: {
        'translation.one': {
          '0': { translation: input.userTranslation, score: 9, feedback: 'Accurate and idiomatic.' },
        },
      },
    });

    const response = (await gradeTranslation(request(input), params('attempt-1'))) as unknown as {
      status: number;
      body: { attempt: { id: string; translationGrades: Record<string, unknown> } };
    };

    expect(response.status).toBe(200);
    expect(response.body.attempt).toMatchObject({
      id: 'attempt-1',
      translationGrades: {
        'translation.one': {
          '0': { translation: input.userTranslation, score: 9, feedback: 'Accurate and idiomatic.' },
        },
      },
    });
    expect(mockGradeTranslationItem).toHaveBeenCalledWith('attempt-1', input, 'student-1');
  });

  it('returns a clear conflict when a translation item is already graded', async () => {
    mockGradeTranslationItem.mockRejectedValue(
      new TestServiceError(
        'ATTEMPT_TRANSLATION_ALREADY_GRADED',
        'This translation item has already been graded with a different answer',
        409
      )
    );

    const response = (await gradeTranslation(
      request({ exerciseId: 'translation.one', itemIndex: 0, userTranslation: 'A different answer.' }),
      params('attempt-1')
    )) as unknown as { status: number; body: { code: string; error: string } };

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'ATTEMPT_TRANSLATION_ALREADY_GRADED',
      error: 'This translation item has already been graded with a different answer',
    });
  });

  it('returns a clear rate limit when the translation grading budget is exhausted', async () => {
    mockGradeTranslationItem.mockRejectedValue(
      new TestServiceError(
        'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED',
        'Too many translation grading requests. Please try again after the grading window resets.',
        429
      )
    );

    const response = (await gradeTranslation(
      request({ exerciseId: 'translation.one', itemIndex: 0, userTranslation: 'The girl sings.' }),
      params('attempt-1')
    )) as unknown as { status: number; body: { code: string; error: string } };

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      code: 'ATTEMPT_TRANSLATION_GRADING_RATE_LIMITED',
      error: 'Too many translation grading requests. Please try again after the grading window resets.',
    });
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
});
