jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({ verifyAdminAccess: jest.fn() }));
jest.mock('@/src/services/firebase-admin', () => ({
  get adminDb() {
    return mockDb;
  },
}));

import { GET, PUT } from '@/src/app/api/admin/vocabulary-ai-guidance/route';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import { readVocabularyAIGuidance } from '@/src/lib/vocabulary-ai-guidance/persistence.server';
import { VOCABULARY_AI_GUIDANCE_COLLECTION, VOCABULARY_AI_GUIDANCE_DOCUMENT } from '@/shared/constants/firestore';

type Data = Record<string, unknown>;
const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
class FakeStore {
  data: Data | undefined;
  writes = 0;
  reads = 0;
  private pending: Promise<unknown> = Promise.resolve();
  collection(name: string) {
    expect(name).toBe(VOCABULARY_AI_GUIDANCE_COLLECTION);
    return {
      doc: (id: string) => {
        expect(id).toBe(VOCABULARY_AI_GUIDANCE_DOCUMENT);
        return { get: async () => this.snapshot() };
      },
    };
  }
  snapshot() {
    this.reads++;
    const data = clone(this.data);
    return { exists: data !== undefined, data: () => data };
  }
  runTransaction<T>(
    callback: (transaction: {
      get: () => Promise<ReturnType<FakeStore['snapshot']>>;
      set: (ref: unknown, data: Data) => void;
    }) => Promise<T>
  ) {
    const run = this.pending.then(async () => {
      let next: Data | undefined;
      let read = false;
      const result = await callback({
        get: async () => {
          expect(next).toBeUndefined();
          read = true;
          return this.snapshot();
        },
        set: (_ref, data) => {
          expect(read).toBe(true);
          expect(next).toBeUndefined();
          next = clone(data);
        },
      });
      if (next) {
        this.data = next;
        this.writes++;
      }
      return result;
    });
    this.pending = run.catch(() => undefined);
    return run;
  }
}
let mockDb: FakeStore;
const request = (body: unknown = {}) => ({ json: async () => body }) as never;
const rule = (id = 'rule-1') => ({ id, instruction: 'Leave participle locatives empty.' });
const auth = jest.mocked(verifyAdminAccess);

beforeEach(() => {
  mockDb = new FakeStore();
  auth.mockReset();
  auth.mockResolvedValue({ uid: 'verified-admin' } as never);
});

it('reads a missing configuration as empty without creating a document', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect((response as unknown as { body: unknown }).body).toEqual({
    revision: 0,
    rules: [],
    updatedAt: null,
    updatedBy: null,
  });
  expect(mockDb.writes).toBe(0);
});

it.each([401, 403])('rejects unauthorized reads and writes before accessing data (%s)', async status => {
  auth.mockRejectedValue(new AdminAccessError('Denied', status));
  expect((await GET(request())).status).toBe(status);
  expect((await PUT(request({ revision: 0, rules: [rule()] }))).status).toBe(status);
  expect(mockDb.reads).toBe(0);
  expect(mockDb.writes).toBe(0);
});

it('saves bounded admin rules and loads them for future model requests', async () => {
  const response = await PUT(request({ revision: 0, rules: [rule()] }));
  expect(response.status).toBe(200);
  expect((response as unknown as { body: unknown }).body).toMatchObject({
    revision: 1,
    rules: [rule()],
    updatedBy: 'verified-admin',
  });
  expect(await readVocabularyAIGuidance(mockDb as never)).toMatchObject({ revision: 1, rules: [rule()] });
  expect(mockDb.writes).toBe(1);
});

it('does not lose an admin update when two saves use the same revision', async () => {
  const responses = await Promise.all([
    PUT(request({ revision: 0, rules: [rule('first')] })),
    PUT(request({ revision: 0, rules: [rule('second')] })),
  ]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  const failed = responses.find(r => r.status === 409)!;
  expect((failed as unknown as { body: unknown }).body).toMatchObject({ code: 'VOCABULARY_AI_GUIDANCE_CHANGED' });
  expect(mockDb.writes).toBe(1);
  expect(mockDb.data?.rules).toEqual([rule('first')]);
});

it('supports editing and removing rules only with the latest revision', async () => {
  await PUT(request({ revision: 0, rules: [rule()] }));
  await PUT(request({ revision: 1, rules: [{ ...rule(), instruction: 'Use the accepted irregular form.' }] }));
  const removed = await PUT(request({ revision: 2, rules: [] }));
  expect(removed.status).toBe(200);
  expect(mockDb.data).toMatchObject({ revision: 3, rules: [] });
  expect((await PUT(request({ revision: 1, rules: [rule()] }))).status).toBe(409);
  expect(mockDb.data?.rules).toEqual([]);
});

it.each([
  { revision: 0, rules: Array.from({ length: 21 }, (_, i) => rule(String(i))) },
  { revision: 0, rules: [rule(), rule()] },
  { revision: 0, rules: [{ id: 'r', instruction: 'x'.repeat(2001) }] },
  { revision: 0, rules: [{ id: 'r', instruction: ' ' }] },
  { revision: 0, rules: [], updatedBy: 'spoofed-actor' },
  { revision: -1, rules: [] },
])('rejects invalid/oversized input before any transaction: %j', async body => {
  expect((await PUT(request(body))).status).toBe(400);
  expect(mockDb.reads).toBe(0);
  expect(mockDb.writes).toBe(0);
});

it.each([
  { rules: [] },
  { revision: 1, rules: 'bad', updatedAt: null, updatedBy: null },
  { revision: 1, rules: [], updatedAt: null, updatedBy: null, _deletionPending: true },
])('fails closed on invalid or deletion-pending persisted guidance: %j', async data => {
  mockDb.data = data;
  expect((await GET(request())).status).toBe(409);
  expect((await PUT(request({ revision: 0, rules: [] }))).status).toBe(409);
  expect(mockDb.writes).toBe(0);
});
