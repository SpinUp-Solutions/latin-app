jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));

const dbState: { collection: (name: string) => unknown } = {
  collection: () => {
    throw new Error('database was not installed');
  },
};

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: { collection: (name: string) => dbState.collection(name) },
}));

const mockVerifyRequestAuth = jest.fn();
jest.mock('@/src/lib/verifyRequestAuth', () => ({
  verifyRequestAuth: (...args: unknown[]) => mockVerifyRequestAuth(...args),
}));

const mockGetAuthorizedLesson = jest.fn();
jest.mock('@/src/lib/learning-units/student-dashboard-service', () => ({
  StudentDashboardServiceError: jest.requireActual('@/src/lib/learning-units/student-dashboard-service')
    .StudentDashboardServiceError,
  studentDashboardService: { getAuthorizedLesson: (...args: unknown[]) => mockGetAuthorizedLesson(...args) },
}));

import { POST } from '@/src/app/api/words/generated-exercise/route';
import { generatedPoolFixture } from './helpers/generatedPoolFixture';
import { createFakeGeneratedWordDb } from './helpers/fakeGeneratedWordFirestore';

const translationExercise = {
  id: 'exercise-1',
  type: 'generated-translation',
  data: {
    generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 10 },
    posConfigs: { noun: { enabled: true, filters: {} }, verb: { enabled: true, filters: {} } },
  },
};

const playbackBody = {
  lessonId: 'lesson-1',
  pageIndex: 0,
  itemIndex: 0,
  exerciseId: 'exercise-1',
};

describe('student generated exercise playback route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const db = createFakeGeneratedWordDb({
      words: [
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `noun-${index}`,
          data: {
            word: `noun-${index}`,
            part_of_speech: 'noun',
            translation: 'girl',
            random_index: 0.5,
            sort_key: `noun-${index}`,
          },
        })),
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `verb-${index}`,
          data: {
            word: `verb-${index}`,
            part_of_speech: 'verb',
            translation: 'love',
            random_index: 0.5,
            sort_key: `verb-${index}`,
          },
        })),
      ],
    });
    dbState.collection = db.collection;
    mockVerifyRequestAuth.mockResolvedValue({ uid: 'student-1' });
    mockGetAuthorizedLesson.mockResolvedValue({ id: 'lesson-1', pages: [{ id: 'page-1', items: [translationExercise] }] });
  });

  it('rejects unauthenticated playback requests', async () => {
    mockVerifyRequestAuth.mockResolvedValue(null);
    const response = await POST({ json: async () => playbackBody } as never);
    expect(response.status).toBe(401);
  });

  it('resolves the authorized persisted exercise into questions, without the words behind them', async () => {
    const response = await POST({ json: async () => playbackBody } as never);
    expect(response.status).toBe(200);
    expect(mockGetAuthorizedLesson).toHaveBeenCalledWith('student-1', 'lesson-1');
    const payload = (response as unknown as { body: { items: Array<{ acceptedAnswers: string[] }> } }).body;
    expect(Object.keys(payload)).toEqual(['items']);
    expect(payload.items).toHaveLength(10);
    expect(payload.items.every(item => ['girl', 'love'].includes(item.acceptedAnswers[0]))).toBe(true);
  });

  it('preserves lesson access failures from the ownership check', async () => {
    const { StudentDashboardServiceError } = jest.requireActual('@/src/lib/learning-units/student-dashboard-service');
    mockGetAuthorizedLesson.mockRejectedValue(new StudentDashboardServiceError('LESSON_LOCKED', 'Lesson is locked', 403));

    const response = await POST({ json: async () => playbackBody } as never);

    expect(response.status).toBe(403);
  });

  it('rejects a stale exercise location instead of trusting client-authored content', async () => {
    const response = await POST({ json: async () => ({ ...playbackBody, exerciseId: 'other-exercise' }) } as never);

    expect(response.status).toBe(404);
  });

  it('rejects the old caller-authored exercise body', async () => {
    const response = await POST({ json: async () => translationExercise } as never);

    expect(response.status).toBe(400);
    expect(mockGetAuthorizedLesson).not.toHaveBeenCalled();
  });

  it('fails closed on an invalid persisted unique word count', async () => {
    const { words, pool, exercise } = generatedPoolFixture();
    const invalidConfig = { ...exercise.data.generatorConfig, uniqueWordCount: 0 };
    exercise.data.generatorConfig = invalidConfig;
    const db = createFakeGeneratedWordDb({ words, pools: [pool] });
    dbState.collection = db.collection;
    mockGetAuthorizedLesson.mockResolvedValue({ id: 'lesson-1', pages: [{ id: 'page-1', items: [exercise] }] });
    const response = await POST({ json: async () => playbackBody } as never);
    expect(response.status).toBe(409);
    expect((response as unknown as { body: { code?: string } }).body.code).toBe('INVALID_GENERATED_EXERCISE');
  });
});
