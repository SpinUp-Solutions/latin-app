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

const mockVerifyAuthenticatedAccess = jest.fn();
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  ...jest.requireActual('@/src/lib/verifyAdminAccess'),
  verifyAuthenticatedAccess: (...args: unknown[]) => mockVerifyAuthenticatedAccess(...args),
}));

import { POST } from '@/src/app/api/words/generated-exercise/route';
import { createFakeGeneratedWordDb } from './helpers/fakeGeneratedWordFirestore';
import { AdminAccessError } from '@/src/lib/admin-access-error';

const translationBody = {
  type: 'generated-translation',
  data: {
    generatorConfig: { collection: 'vocabulary_words_v5', wordSource: 'filters', count: 10 },
    posConfigs: { noun: { enabled: true, filters: {} }, verb: { enabled: true, filters: {} } },
  },
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
    mockVerifyAuthenticatedAccess.mockResolvedValue({ uid: 'student-1' });
  });

  it('rejects unauthenticated playback requests', async () => {
    mockVerifyAuthenticatedAccess.mockRejectedValue(new AdminAccessError('Unauthorized', 401));
    const response = await POST({ json: async () => translationBody } as never);
    expect(response.status).toBe(401);
  });

  it('returns exactly count usable words from the shared collector', async () => {
    const response = await POST({ json: async () => translationBody } as never);
    expect(response.status).toBe(200);
    const payload = (response as unknown as { body: { words: unknown[]; collected: number } }).body;
    expect(payload.words).toHaveLength(10);
    expect(payload.collected).toBe(10);
  });
});
