jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({ verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })) }));
jest.mock('@/src/services/firebase-admin', () => ({
  get adminDb() {
    return mockDb;
  },
}));
jest.mock('@/src/lib/vocabulary-pools/sync-lock.server', () => ({
  runVocabularyContentMutation: (db: { runTransaction: (callback: unknown) => unknown }, callback: unknown) =>
    db.runTransaction(callback),
}));

import { PATCH } from '@/src/app/api/admin/vocabulary-word-requests/[id]/route';
import { POST as approve } from '@/src/app/api/admin/vocabulary-word-requests/[id]/approve/route';
import { buildValidatedWordForApproval } from '@/src/app/api/admin/vocabulary-word-requests/utils';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import type { VocabularyWord } from '@/shared/types/vocabulary/schemas';

type Data = Record<string, unknown>;
const review = {
  uncertainties: [{ field: 'translation', explanation: 'Check the sense.' }],
  guidance: [{ id: 'sense', instruction: 'Prefer the conjunction sense.' }],
};
const word = {
  word: 'et',
  part_of_speech: 'conjunction',
  translation: 'and',
  definitions: [],
  etymology: null,
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: null,
  sort_key: 'et',
  random_index: 0.5,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};
let stored: Data | undefined;
let createdWord: Data | undefined;
let transactionWrites: number;
let beforeTransaction: (() => void) | undefined;
const snapshot = () => ({ id: 'request-1', exists: stored !== undefined, data: () => stored });
const mockDb = {
  collection: () => ({ doc: (id = 'new-word-1') => ({ id, get: async () => snapshot() }) }),
  runTransaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
    beforeTransaction?.();
    return callback({
      get: async () => snapshot(),
      create: (_ref: unknown, data: Data) => {
        transactionWrites += 1;
        createdWord = data;
      },
      update: (_ref: unknown, changes: Data) => {
        transactionWrites += 1;
        stored = { ...stored, ...changes };
      },
    });
  },
};
const save = async (draftWord: unknown) =>
  (await PATCH({ json: async () => ({ draftWord }) } as never, {
    params: Promise.resolve({ id: 'request-1' }),
  })) as unknown as { status: number; body: { data: { request: { draftWord: Data } }; code?: string } };

beforeEach(() => {
  stored = { status: 'pending', draftWord: { ...word, ai_review: review }, createdAt: word.createdAt };
  createdWord = undefined;
  transactionWrites = 0;
  beforeTransaction = undefined;
  jest.mocked(verifyAdminAccess).mockResolvedValue({ uid: 'admin-1' } as never);
});

it('retains the current stored review when a legacy editor omits it and does not persist generation envelopes', async () => {
  const latestReview = { ...review, guidance: [{ id: 'latest', instruction: 'Most recently saved guidance.' }] };
  beforeTransaction = () => {
    stored = { ...stored, draftWord: { ...word, ai_review: latestReview } };
  };
  const result = await save({ ...word, translation: 'and also', review_answer: 'Transient', uncertainties: [] });
  expect(result.status).toBe(200);
  expect(result.body.data.request.draftWord).toMatchObject({ translation: 'and also', ai_review: latestReview });
  expect(result.body.data.request.draftWord).not.toHaveProperty('review_answer');
  expect(result.body.data.request.draftWord).not.toHaveProperty('uncertainties');
  expect(transactionWrites).toBe(1);
});

it('accepts an explicit empty review to clear it', async () => {
  const empty = { uncertainties: [], guidance: [] };
  expect((await save({ ...word, ai_review: empty })).body.data.request.draftWord.ai_review).toEqual(empty);
});

it.each([null, 'invalid', { uncertainties: [], guidance: [], review_answer: 'Transient' }])(
  'rejects invalid incoming review metadata without writing: %p',
  async ai_review => {
    expect((await save({ ...word, ai_review })).status).toBe(400);
    expect(transactionWrites).toBe(0);
  }
);

it('rejects invalid retained metadata rather than silently dropping it', async () => {
  stored = { ...stored, draftWord: { ...word, ai_review: null } };
  expect(await save(word)).toMatchObject({ status: 409, body: { code: 'INVALID_STORED_AI_REVIEW' } });
  expect(transactionWrites).toBe(0);
});

it('returns not found without writing for a missing request', async () => {
  stored = undefined;
  expect((await save(word)).status).toBe(404);
  expect(transactionWrites).toBe(0);
});

it('requires admin access before changing draft review metadata', async () => {
  jest.mocked(verifyAdminAccess).mockRejectedValue(new AdminAccessError('Admin access required', 403));
  expect((await save(word)).status).toBe(403);
  expect(transactionWrites).toBe(0);
});

it('keeps review metadata in the validated new-word approval payload, excluding generation envelopes', () => {
  const result = buildValidatedWordForApproval({
    ...word,
    ai_review: review,
    review_answer: 'Transient',
  } as unknown as VocabularyWord);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error);
  expect(result.data.firestorePayload).toMatchObject({ ai_review: review });
  expect(result.data.firestorePayload).not.toHaveProperty('review_answer');
});

it('approves the current transaction draft when review metadata changed after the initial read', async () => {
  const latestReview = { ...review, guidance: [{ id: 'latest', instruction: 'Saved immediately before approval.' }] };
  beforeTransaction = () => {
    stored = { ...stored, draftWord: { ...word, translation: 'and also', ai_review: latestReview } };
  };
  const result = await approve({} as never, { params: Promise.resolve({ id: 'request-1' }) });
  expect(result.status).toBe(200);
  expect(createdWord).toMatchObject({ translation: 'and also', ai_review: latestReview });
  expect(stored).toMatchObject({ status: 'approved', draftWord: { translation: 'and also', ai_review: latestReview } });
});

it('does not approve an invalid review introduced between the initial read and transaction', async () => {
  beforeTransaction = () => {
    stored = { ...stored, draftWord: { ...word, ai_review: null } };
  };
  const result = await approve({} as never, { params: Promise.resolve({ id: 'request-1' }) });
  expect(result.status).toBe(400);
  expect(createdWord).toBeUndefined();
  expect(transactionWrites).toBe(0);
  expect(stored?.status).toBe('pending');
});
