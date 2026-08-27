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

const mockGetLesson = jest.fn();
jest.mock('@/src/lib/learning-units/student-dashboard-service', () => ({
  studentDashboardService: { getLesson: (...args: unknown[]) => mockGetLesson(...args) },
}));

import { POST } from '@/src/app/api/words/generated-exercise/route';
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
    mockGetLesson.mockResolvedValue({ id: 'lesson-1', pages: [{ id: 'page-1', items: [translationExercise] }] });
  });

  it('rejects unauthenticated playback requests', async () => {
    mockVerifyRequestAuth.mockResolvedValue(null);
    const response = await POST({ json: async () => playbackBody } as never);
    expect(response.status).toBe(401);
  });

  it('loads the authorized persisted exercise and returns exactly count usable words', async () => {
    const response = await POST({ json: async () => playbackBody } as never);
    expect(response.status).toBe(200);
    expect(mockGetLesson).toHaveBeenCalledWith('student-1', 'lesson-1');
    const payload = (response as unknown as { body: { words: unknown[]; collected: number } }).body;
    expect(payload.words).toHaveLength(10);
    expect(payload.collected).toBe(10);
  });

  it('preserves lesson access failures from the ownership check', async () => {
    mockGetLesson.mockRejectedValue(
      Object.assign(new Error('Lesson is locked'), { status: 403, code: 'LESSON_LOCKED' })
    );

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
    expect(mockGetLesson).not.toHaveBeenCalled();
  });
});
