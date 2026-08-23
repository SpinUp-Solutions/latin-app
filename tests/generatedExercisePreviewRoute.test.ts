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

const mockVerifyAdminAccess = jest.fn();
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  ...jest.requireActual('@/src/lib/verifyAdminAccess'),
  verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
}));
jest.mock('@/src/lib/verifyRequestAuth', () => ({ verifyRequestAuth: jest.fn() }));
jest.mock('@/src/lib/learning-units/student-dashboard-service', () => ({
  studentDashboardService: { getLesson: jest.fn() },
}));

import { POST } from '@/src/app/api/admin/exercises/generated-preview/route';
import { createFakeGeneratedWordDb } from './helpers/fakeGeneratedWordFirestore';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import { MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';

const translationBody = {
  type: 'generated-translation',
  data: {
    generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 10 },
    posConfigs: { noun: { enabled: true, filters: {} }, verb: { enabled: true, filters: {} } },
  },
};

describe('admin generated exercise preview route', () => {
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
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-1' });
  });

  it('rejects unauthenticated preview requests', async () => {
    mockVerifyAdminAccess.mockRejectedValue(new AdminAccessError('Unauthorized', 401));
    const response = await POST({ json: async () => translationBody } as never);
    expect(response.status).toBe(401);
  });

  it('returns exactly count usable words and per-spec diagnostics', async () => {
    const response = await POST({ json: async () => translationBody } as never);
    expect(response.status).toBe(200);
    const payload = (response as unknown as { body: { words: unknown[]; diagnostics: unknown[]; collected: number } })
      .body;
    expect(payload.words).toHaveLength(10);
    expect(payload.collected).toBe(10);
    expect(payload.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ specId: 'noun' }),
        expect.objectContaining({ specId: 'verb' }),
      ])
    );
  });

  it('preserves count: all through the preview endpoint', async () => {
    const response = await POST({
      json: async () => ({
        ...translationBody,
        data: {
          ...translationBody.data,
          generatorConfig: { ...translationBody.data.generatorConfig, count: 'all' },
        },
      }),
    } as never);
    expect(response.status).toBe(200);
    const payload = (response as unknown as { body: { words: unknown[]; requestedCount: unknown } }).body;
    expect(payload.requestedCount).toBe('all');
    expect(payload.words).toHaveLength(16);
  });

  it('rejects an invalid collection like delivery', async () => {
    const response = await POST({
      json: async () => ({
        ...translationBody,
        data: {
          ...translationBody.data,
          generatorConfig: { ...translationBody.data.generatorConfig, collection: 'users' },
        },
      }),
    } as never);
    expect(response.status).toBe(400);
  });

  it('rejects a missing pool like delivery', async () => {
    const response = await POST({
      json: async () => ({
        ...translationBody,
        data: {
          ...translationBody.data,
          generatorConfig: {
            ...translationBody.data.generatorConfig,
            wordSource: 'pool',
            poolId: 'missing-pool',
          },
        },
      }),
    } as never);
    expect(response.status).toBe(404);
  });

  it('rejects a pool source without a selected pool instead of querying the full collection', async () => {
    const response = await POST({
      json: async () => ({
        ...translationBody,
        data: {
          ...translationBody.data,
          generatorConfig: {
            ...translationBody.data.generatorConfig,
            wordSource: 'pool',
            poolId: null,
          },
        },
      }),
    } as never);

    expect(response.status).toBe(400);
    expect((response as unknown as { body: { code?: string } }).body.code).toBe('POOL_ID_REQUIRED');
  });

  it('rejects counts above the authorable ceiling', async () => {
    const response = await POST({
      json: async () => ({
        ...translationBody,
        data: {
          ...translationBody.data,
          generatorConfig: {
            ...translationBody.data.generatorConfig,
            count: MAX_GENERATED_WORD_COUNT + 1,
          },
        },
      }),
    } as never);
    expect(response.status).toBe(400);
  });

  it('rejects a numeric verb conjugation filter instead of 500ing', async () => {
    const response = await POST({
      json: async () => ({
        ...translationBody,
        data: {
          ...translationBody.data,
          posConfigs: { verb: { enabled: true, filters: { verbConjugation: 3 } } },
        },
      }),
    } as never);
    expect(response.status).toBe(400);
  });

  it('rejects filter lists that exceed the Firestore in-query operand bound', async () => {
    const response = await POST({
      json: async () => ({
        ...translationBody,
        data: {
          ...translationBody.data,
          posConfigs: {
            verb: { enabled: true, filters: { verbConjugation: Array.from({ length: 31 }, () => '1').join(',') } },
          },
        },
      }),
    } as never);
    expect(response.status).toBe(400);
  });
});
