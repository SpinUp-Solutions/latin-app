/* eslint-disable @typescript-eslint/no-explicit-any -- In-memory Firestore test adapter. */
jest.mock('firebase-admin/firestore', () => ({
  FieldPath: { documentId: () => '__name__' },
  FieldValue: { serverTimestamp: () => new Date() },
}));
import { serialize, deserialize } from 'node:v8';
const structuredClone = <T>(value: T): T => deserialize(serialize(value));
import type { NextRequest } from 'next/server';
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));
import { VOCABULARY_POOL_COLLECTION, VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { createVocabularyPoolFromPoolsRequestSchema } from '@/shared/types/vocabulary/pool-requests';
import {
  createLinkedVocabularyPool,
  resolveVocabularyPool,
  updateLinkedPoolMembership,
} from '@/src/lib/vocabulary-pools/linked-pools.server';
import { vocabularyPoolContentFingerprint } from '@/src/lib/vocabulary-pools/deletion.server';
import { CONTENT_SYNC_LOCK_COLLECTION, CONTENT_SYNC_LOCK_ID } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { getReadableVocabularyPool } from '@/src/lib/vocabulary-pools/archive.server';
import { projectVocabularyPoolUsages } from '@/src/lib/vocabulary-pools/usage.server';

type Data = Record<string, any>;
class MemoryDb {
  docs = new Map<string, Data>();
  writes: number[] = [];
  queryReads: Array<{ collection: string; limit: number; count: number }> = [];
  failAfterPublication = false;
  collection(name: string) {
    const query = (
      filters: Array<[string, string, unknown]> = [],
      maximum = Infinity,
      orderField = '__name__',
      direction = 'asc',
      cursor?: { id: string; data: () => Data },
      fields?: string[]
    ): any => ({
      doc: (id: string) => this.ref(`${name}/${id}`),
      where: (field: string, op: string, value: unknown) =>
        query([...filters, [field, op, value]], maximum, orderField, direction, cursor, fields),
      orderBy: (field: string, order = 'asc') => query(filters, maximum, field, order, cursor, fields),
      startAfter: (snapshot: { id: string; data: () => Data }) =>
        query(filters, maximum, orderField, direction, snapshot, fields),
      select: (...selected: string[]) => query(filters, maximum, orderField, direction, cursor, selected),
      limit: (n: number) => query(filters, n, orderField, direction, cursor, fields),
      get: async () => {
        const orderValue = (snapshot: { id: string; data: () => Data }) =>
          orderField === '__name__'
            ? snapshot.id
            : orderField.split('.').reduce((value, key) => value?.[key], snapshot.data());
        const compare = (left: { id: string; data: () => Data }, right: { id: string; data: () => Data }) => {
          const a = orderValue(left);
          const b = orderValue(right);
          return (direction === 'asc' ? 1 : -1) * (a < b ? -1 : a > b ? 1 : 0);
        };
        const docs = [...this.docs.keys()]
          .filter(path => path.startsWith(`${name}/`) && path.split('/').length === name.split('/').length + 1)
          .map(path => this.snapshot(path))
          .filter(snapshot =>
            filters.every(([field, op, value]) => {
              const actual =
                field === '__name__'
                  ? snapshot.id
                  : field.split('.').reduce((value, key) => value?.[key], snapshot.data());
              if (op === 'array-contains') return actual?.includes(value);
              if (op === 'in') return Array.isArray(value) && value.includes(actual);
              return actual === value;
            })
          )
          .sort(compare)
          .filter(snapshot => !cursor || compare(snapshot, cursor) > 0)
          .slice(0, maximum)
          .map(snapshot => ({
            ...snapshot,
            data: () =>
              fields
                ? Object.fromEntries(Object.entries(snapshot.data()).filter(([field]) => fields.includes(field)))
                : snapshot.data(),
          }));
        this.queryReads.push({ collection: name, limit: maximum, count: docs.length });
        return { docs, empty: docs.length === 0, size: docs.length };
      },
      count: () => ({
        get: async () => {
          const snapshot = await query(filters).get();
          return { data: () => ({ count: snapshot.size }) };
        },
      }),
    });
    return query();
  }
  ref(path: string): any {
    return { path, id: path.split('/').at(-1), get: async () => this.snapshot(path) };
  }
  snapshot(path: string): any {
    const data = this.docs.get(path);
    return {
      id: path.split('/').at(-1),
      ref: this.ref(path),
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : structuredClone(data)),
    };
  }
  async getAll(...refs: any[]) {
    return refs.map(ref => this.snapshot(ref.path));
  }
  async runTransaction(callback: (transaction: any) => Promise<any>) {
    const pending: Array<() => void> = [];
    const read = () => {
      if (pending.length) throw new Error('Read after write');
    };
    const transaction = {
      get: async (ref: any) => {
        read();
        return ref.path ? this.snapshot(ref.path) : ref.get();
      },
      getAll: async (...refs: any[]) => {
        read();
        return this.getAll(...refs);
      },
      create: (ref: any, data: Data) =>
        pending.push(() => {
          if (this.docs.has(ref.path)) throw new Error('Already exists');
          this.docs.set(ref.path, structuredClone(data));
        }),
      set: (ref: any, data: Data) => pending.push(() => this.docs.set(ref.path, structuredClone(data))),
      delete: (ref: any) => pending.push(() => this.docs.delete(ref.path)),
      update: (ref: any, data: Data) =>
        pending.push(() => {
          const current = structuredClone(this.docs.get(ref.path)!);
          for (const [key, value] of Object.entries(data)) {
            const parts = key.split('.');
            let target = current;
            for (const part of parts.slice(0, -1)) target = target[part] ??= {};
            target[parts.at(-1)!] = value;
          }
          this.docs.set(ref.path, current);
        }),
    };
    const result = await callback(transaction);
    expect(pending.length).toBeLessThanOrEqual(200);
    this.writes.push(pending.length);
    pending.forEach(write => write());
    if (this.failAfterPublication && [...this.docs.keys()].some(path => path.startsWith('vocabulary_pools/linked-'))) {
      this.failAfterPublication = false;
      throw new Error('Response lost');
    }
    return result;
  }
}
let mockDb: MemoryDb;
let mockAuthorized = true;
jest.mock('@/src/services/firebase-admin', () => ({
  get adminDb() {
    return mockDb;
  },
}));
jest.mock('@/src/lib/verifyAdminAccess', () => {
  const { AdminAccessError } = jest.requireActual('@/src/lib/admin-access-error');
  return {
    AdminAccessError,
    verifyAdminAccess: async () => {
      if (!mockAuthorized) throw new AdminAccessError('Unauthorized', 401, 'UNAUTHORIZED');
      return { uid: 'admin' };
    },
  };
});
import { POST as createRoute } from '@/src/app/api/admin/vocabulary-pools/from-pools/route';
import { GET as getPool, PUT as updateRoute } from '@/src/app/api/admin/vocabulary-pools/[poolId]/route';
import { POST as addWords, DELETE as removeWords } from '@/src/app/api/admin/vocabulary-pools/[poolId]/words/route';
import { POST as prepareDeletion } from '@/src/app/api/admin/vocabulary-pools/[poolId]/deletion-challenge/route';
import { GET as listPools } from '@/src/app/api/admin/vocabulary-pools/route';
const request = (method: string, body: unknown) => ({ method, json: async () => body }) as NextRequest;
const params = (poolId: string) => ({ params: Promise.resolve({ poolId }) });
const poolPath = (id: string) => `${VOCABULARY_POOL_COLLECTION}/${id}`;
function seed(id: string, words: string[], sources?: string[]) {
  mockDb.docs.set(poolPath(id), {
    name: id,
    description: id,
    wordDocIds: words,
    ...(sources ? { sourcePoolIds: sources } : {}),
    metadata: {
      wordCount: words.length,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'admin',
      updatedBy: 'admin',
      difficulty: 'beginner',
      tags: [],
      isActive: true,
    },
  });
  words.forEach(id => mockDb.docs.set(`${VOCABULARY_WORDS_COLLECTION}/${id}`, { word: id }));
}
const input = (extra: Data = {}) =>
  createVocabularyPoolFromPoolsRequestSchema.parse({
    name: 'Lesson 5',
    description: 'Review',
    sourcePoolIds: ['lesson-3'],
    wordDocIds: ['own'],
    requestId: 'request',
    ...extra,
  });
const create = (extra: Data = {}) => createLinkedVocabularyPool(mockDb as never, 'admin', input(extra));
const read = (id: string) => resolveVocabularyPool(mockDb as never, id, mockDb.docs.get(poolPath(id))!);
beforeEach(() => {
  mockDb = new MemoryDb();
  mockAuthorized = true;
  seed('lesson-3', ['a', 'b']);
  mockDb.docs.set(`${VOCABULARY_WORDS_COLLECTION}/own`, { word: 'own' });
});

test('create endpoint defaults to live links; source edits update nested pools, preserving overlap and direct words', async () => {
  const response = await createRoute(request('POST', input()));
  expect(response.status).toBe(201);
  const {
    data: { pool },
  } = await response.json();
  expect(pool._copyRequest).toBeUndefined();
  expect(pool.wordDocIds).toEqual(['a', 'b', 'own']);
  expect(mockDb.docs.get(poolPath(pool.id))?.wordDocIds).toEqual(['own']);
  seed('overlap', ['b']);
  const nested = await create({ sourcePoolIds: [pool.id, 'overlap'], wordDocIds: [], requestId: 'nested' });
  mockDb.docs.set(`${VOCABULARY_WORDS_COLLECTION}/c`, { word: 'c' });
  const updated = await updateRoute(request('PUT', { wordDocIds: ['c'] }), params('lesson-3'));
  expect(updated.status).toBe(200);
  expect((await read(pool.id)).wordDocIds).toEqual(['c', 'own']);
  expect((await read(nested.id)).wordDocIds).toEqual(['c', 'own', 'b']);
  expect((await getReadableVocabularyPool(mockDb as never, nested.id))?.data.metadata.wordCount).toBe(3);
});

test('update endpoint persists metadata.isActive changes', async () => {
  seed('inactive-copy', ['a']);
  mockDb.docs.get(poolPath('inactive-copy'))!.metadata.isActive = false;

  const activate = await updateRoute(request('PUT', { isActive: true }), params('inactive-copy'));
  expect(activate.status).toBe(200);
  expect((await activate.json()).data.pool.metadata.isActive).toBe(true);
  expect(mockDb.docs.get(poolPath('inactive-copy'))?.metadata.isActive).toBe(true);

  const deactivate = await updateRoute(request('PUT', { isActive: false }), params('inactive-copy'));
  expect(deactivate.status).toBe(200);
  expect((await deactivate.json()).data.pool.metadata.isActive).toBe(false);
  expect(mockDb.docs.get(poolPath('inactive-copy'))?.metadata.isActive).toBe(false);
});

test('individual inherited removals are rejected by both mutation routes', async () => {
  const pool = await create();
  const deletion = await removeWords(request('DELETE', { wordDocIds: ['a'] }), params(pool.id));
  expect(deletion.status).toBe(409);
  expect((await deletion.json()).code).toBe('VOCABULARY_POOL_INHERITED_WORD');
  const replacement = await updateRoute(request('PUT', { wordDocIds: ['own'] }), params(pool.id));
  expect(replacement.status).toBe(409);
  expect((await replacement.json()).code).toBe('VOCABULARY_POOL_INHERITED_WORD');
  expect((await read(pool.id)).wordDocIds).toEqual(['a', 'b', 'own']);
});

test('editing direct words and unlinking a whole source preserves explicit overlapping words', async () => {
  const pool = await create({ wordDocIds: ['a', 'own'] });
  await updateLinkedPoolMembership(mockDb as never, pool.id, {}, { directWordDocIds: ['a'], sourcePoolIds: [] });
  expect((await read(pool.id)).wordDocIds).toEqual(['a']);
});

test.each([false, true])(
  'unlink survives a fresh GET and releases the source for deletion (keep another source: %s)',
  async keepAnotherSource => {
    seed('other-source', ['other']);
    const remainingSources = keepAnotherSource ? ['other-source'] : [];
    const pool = await create({ sourcePoolIds: ['lesson-3', ...remainingSources], wordDocIds: ['a', 'own'] });
    expect((await prepareDeletion(request('POST', {}), params('lesson-3'))).status).toBe(409);

    const response = await updateRoute(
      request('PUT', { directWordDocIds: ['a', 'own'], sourcePoolIds: remainingSources }),
      params(pool.id)
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.pool.sourcePoolIds).toEqual(remainingSources);
    expect(mockDb.docs.get(poolPath(pool.id))?.sourcePoolIds).toEqual(remainingSources);

    const reloaded = await getPool(request('GET', undefined), params(pool.id));
    expect(reloaded.status).toBe(200);
    const body = await reloaded.json();
    expect(body.data.pool.sourcePoolIds).toEqual(remainingSources);
    const expectedWords = keepAnotherSource ? ['other', 'a', 'own'] : ['a', 'own'];
    expect(body.data.pool.wordDocIds).toEqual(expectedWords);
    expect(body.data.pool.words.map((word: { id: string }) => word.id)).toEqual(expectedWords);
    expect(body.data.actualWordCount).toBe(expectedWords.length);

    const deletion = await prepareDeletion(request('POST', {}), params('lesson-3'));
    expect(deletion.status).toBe(200);
    expect((await deletion.json()).data.usages).toEqual([]);
    if (keepAnotherSource)
      expect((await prepareDeletion(request('POST', {}), params('other-source'))).status).toBe(409);
  }
);

test('source changes cannot introduce indirect cycles', async () => {
  const pool = await create();
  const response = await updateRoute(request('PUT', { sourcePoolIds: [pool.id] }), params('lesson-3'));
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe('VOCABULARY_POOL_LINK_CYCLE');
  expect(mockDb.docs.get(poolPath('lesson-3'))?.sourcePoolIds).toBeUndefined();
});

test.each(['missing', 'deleting', 'staging', 'archived', 'malformed'])(
  'rejects %s source without publishing a pool',
  async state => {
    if (state === 'missing') mockDb.docs.delete(poolPath('lesson-3'));
    if (state === 'deleting') mockDb.docs.get(poolPath('lesson-3'))!._deletionPending = true;
    if (state === 'staging') mockDb.docs.get(poolPath('lesson-3'))!._creationPending = {};
    if (state === 'archived') mockDb.docs.set('deleted_vocabulary_pools/lesson-3', { archiveId: 'archive' });
    if (state === 'malformed') mockDb.docs.get(poolPath('lesson-3'))!.wordDocIds = 'bad';
    const response = await createRoute(request('POST', input()));
    expect(response.status).toBe(409);
    expect([...mockDb.docs.keys()].filter(key => key.includes('/linked-'))).toEqual([]);
  }
);

test('fails closed on a corrupt persisted cycle', async () => {
  seed('x', [], ['y']);
  seed('y', [], ['x']);
  await expect(read('x')).rejects.toMatchObject({ code: 'VOCABULARY_POOL_LINK_CYCLE' });
});

test('large creation and membership updates use batches of at most 200 writes and all reads precede writes', async () => {
  const words = Array.from({ length: 650 }, (_, i) => `w${i}`);
  seed('large', words);
  const pool = await create({ wordDocIds: words, sourcePoolIds: ['large'] });
  expect(mockDb.writes).toContain(200);
  expect((await read(pool.id)).wordDocIds).toHaveLength(650);
  const extra = Array.from({ length: 650 }, (_, i) => `e${i}`);
  seed('extra', extra);
  await updateLinkedPoolMembership(mockDb as never, pool.id, {}, { directWordDocIds: extra });
  expect((await read(pool.id)).wordDocIds).toHaveLength(1300);
});

test('retry after a lost publication response returns the same pool without repeating source revisions', async () => {
  mockDb.failAfterPublication = true;
  await expect(create()).rejects.toThrow('Response lost');
  const revision = mockDb.docs.get(poolPath('lesson-3'))!._assignmentRevision;
  const pool = await create();
  expect(pool.id).toMatch(/^linked-/);
  expect(mockDb.docs.get(poolPath('lesson-3'))!._assignmentRevision).toBe(revision);
  expect([...mockDb.docs.keys()].filter(key => key.includes('/linked-'))).toHaveLength(1);
});

test('revisions stale a source deletion challenge and usage projection exposes the dependent pool', async () => {
  const before = vocabularyPoolContentFingerprint(mockDb.docs.get(poolPath('lesson-3'))!);
  const pool = await create();
  expect(vocabularyPoolContentFingerprint(mockDb.docs.get(poolPath('lesson-3'))!)).not.toBe(before);
  const usages = projectVocabularyPoolUsages({
    learningUnits: [],
    versions: [],
    drafts: [],
    mocks: [],
    pools: [{ id: pool.id, data: mockDb.docs.get(poolPath(pool.id))! }],
  });
  expect(usages).toEqual([
    expect.objectContaining({ poolId: 'lesson-3', kind: 'pool', editorUrl: `/admin/vocabulary-pools/${pool.id}/edit` }),
  ]);
});

test('existing lock blocks changes and is never removed or replaced', async () => {
  const path = `${CONTENT_SYNC_LOCK_COLLECTION}/${CONTENT_SYNC_LOCK_ID}`;
  mockDb.docs.set(path, { ownerId: 'another-operation' });
  await expect(create()).rejects.toMatchObject({ status: 409 });
  expect(mockDb.docs.get(path)).toEqual({ ownerId: 'another-operation' });
});

test('unauthorized create/update/removal fail before touching the database', async () => {
  mockAuthorized = false;
  expect((await createRoute(request('POST', input()))).status).toBe(401);
  expect((await updateRoute(request('PUT', { sourcePoolIds: [] }), params('lesson-3'))).status).toBe(401);
  expect((await removeWords(request('DELETE', { wordDocIds: ['a'] }), params('lesson-3'))).status).toBe(401);
  expect(mockDb.writes).toEqual([]);
});

test.each([false, true])('missing/deleting direct words cannot be added (deleting: %s)', async deleting => {
  if (deleting) mockDb.docs.get(`${VOCABULARY_WORDS_COLLECTION}/own`)!._deletionPending = true;
  else mockDb.docs.delete(`${VOCABULARY_WORDS_COLLECTION}/own`);
  await expect(create()).rejects.toMatchObject({ code: 'VOCABULARY_POOL_WORDS_MISSING' });
  expect([...mockDb.docs.keys()].filter(key => key.includes('/linked-'))).toEqual([]);
});

test('adding 400 words through the endpoint is bounded and inherited duplicates remain inherited', async () => {
  const pool = await create();
  const ids = Array.from({ length: 399 }, (_, i) => `added-${i}`);
  ids.forEach(id => mockDb.docs.set(`${VOCABULARY_WORDS_COLLECTION}/${id}`, { word: id }));
  const response = await addWords(request('POST', { wordDocIds: [...ids, 'a'] }), params(pool.id));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data.addedCount).toBe(399);
  expect(body.data.duplicateCount).toBe(1);
  expect(mockDb.docs.get(poolPath(pool.id))?.wordDocIds).not.toContain('a');
});

test('word-count list ordering and pages use current effective counts', async () => {
  const pool = await create();
  seed('four', ['a', 'b', 'own', 'fourth']);
  const list = (cursor = '') =>
    listPools({
      url: `http://localhost/api/admin/vocabulary-pools?sortBy=wordCount&sortOrder=desc&limit=1${cursor ? `&lastPoolId=${cursor}` : ''}`,
    } as NextRequest);
  expect((await (await list()).json()).data.pools[0].id).toBe('four');
  const page2 = (await (await list('four')).json()).data;
  expect(page2.pools[0].id).toBe(pool.id);
  expect(page2.pools[0].metadata.wordCount).toBe(3);
  const words = ['a', 'b', 'c', 'd', 'e'];
  words.forEach(id => mockDb.docs.set(`${VOCABULARY_WORDS_COLLECTION}/${id}`, { word: id }));
  await updateLinkedPoolMembership(mockDb as never, 'lesson-3', {}, { wordDocIds: words });
  const refreshed = (await (await list()).json()).data;
  expect(refreshed.pools[0].id).toBe(pool.id);
  expect(refreshed.pools[0].metadata.wordCount).toBe(6);
});

test('deletion preparation blocks referenced sources and fingerprints inherited words', async () => {
  const pool = await create();
  expect((await prepareDeletion(request('POST', {}), params('lesson-3'))).status).toBe(409);
  const challenge = await prepareDeletion(request('POST', {}), params(pool.id));
  expect(challenge.status).toBe(200);
  expect((await challenge.json()).data.wordCount).toBe(3);
  const before = vocabularyPoolContentFingerprint(await read(pool.id));
  await updateLinkedPoolMembership(mockDb as never, 'lesson-3', {}, { wordDocIds: ['b'] });
  expect(vocabularyPoolContentFingerprint(await read(pool.id))).not.toBe(before);
});

const listByCount = (query: Record<string, string> = {}) =>
  listPools({
    url: `http://localhost/api/admin/vocabulary-pools?${new URLSearchParams({ sortBy: 'wordCount', ...query })}`,
  } as NextRequest);

test.each(['asc', 'desc'])('paginates every pool in a 505-pool catalog by live count (%s)', async sortOrder => {
  mockDb.docs.clear();
  const expected: Array<{ id: string; count: number }> = [];
  for (let index = 0; index < 505; index++) {
    const id = `pool-${String(index).padStart(3, '0')}`;
    const count = index % 5;
    // Edited ordinary pools persist sourcePoolIds: []; these are not one graph.
    seed(
      id,
      Array.from({ length: count }, (_, word) => `word-${word}`),
      []
    );
    expected.push({ id, count });
  }
  expected.sort((a, b) => a.count - b.count || a.id.localeCompare(b.id));
  if (sortOrder === 'desc') expected.reverse();

  const ids: string[] = [];
  let cursor = '';
  for (let page = 0; page < 26; page++) {
    const response = await listByCount({ sortOrder, limit: '20', ...(cursor ? { lastPoolId: cursor } : {}) });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.pools.map((pool: { id: string }) => pool.id)).toEqual(
      expected.slice(page * 20, page * 20 + 20).map(pool => pool.id)
    );
    expect(data.hasMore).toBe(page < 25);
    cursor = data.lastPoolId;
    ids.push(...data.pools.map((pool: { id: string }) => pool.id));
  }
  expect(new Set(ids).size).toBe(505);
  const last = await listByCount({ sortOrder, lastPoolId: cursor });
  expect((await last.json()).data).toEqual({ pools: [], hasMore: false, lastPoolId: null });
  expect(mockDb.queryReads.every(read => read.limit <= 200 && read.count <= 200)).toBe(true);
  expect(mockDb.writes).toEqual([]);
});

test('filters a catalog above 500 before resolving unrelated links and hides pending pools', async () => {
  for (let index = 0; index < 501; index++) seed(`unrelated-${index}`, [], ['missing-source']);
  seed('matching', ['a', 'b']);
  seed('wrong-tag', ['a']);
  seed('wrong-active', ['a']);
  seed('pending', ['a']);
  seed('deleting', ['a']);
  for (const id of ['matching', 'wrong-tag', 'wrong-active', 'pending', 'deleting']) {
    Object.assign(mockDb.docs.get(poolPath(id))!.metadata, {
      difficulty: 'advanced',
      isActive: false,
      tags: ['review'],
    });
  }
  mockDb.docs.get(poolPath('wrong-tag'))!.metadata.tags = ['other'];
  mockDb.docs.get(poolPath('wrong-active'))!.metadata.isActive = true;
  mockDb.docs.get(poolPath('pending'))!._creationPending = {};
  mockDb.docs.get(poolPath('deleting'))!._deletionPending = true;
  const response = await listByCount({ difficulty: 'advanced', isActive: 'false', tags: 'review,alternate' });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({
    pools: [{ id: 'matching' }],
    hasMore: false,
    lastPoolId: 'matching',
  });
  const empty = await listByCount({ difficulty: 'intermediate' });
  expect(empty.status).toBe(200);
  expect((await empty.json()).data).toEqual({ pools: [], hasMore: false, lastPoolId: null });
});

test('more than 500 independent linked pools retain live nested counts after source edits', async () => {
  for (let index = 0; index < 501; index++) seed(`linked-${index}`, [], ['lesson-3']);
  seed('nested', ['own', 'a'], ['linked-0']);
  let response = await listByCount({ limit: '1' });
  expect(response.status).toBe(200);
  expect((await response.json()).data.pools[0]).toMatchObject({ id: 'nested', metadata: { wordCount: 3 } });
  seed('lesson-3', ['b', 'c', 'd']);
  response = await listByCount({ limit: '1' });
  expect(response.status).toBe(200);
  expect((await response.json()).data.pools[0]).toMatchObject({ id: 'nested', metadata: { wordCount: 5 } });
});

test('name-sorted pages can include unrelated graphs whose combined size exceeds 500', async () => {
  for (let index = 0; index < 100; index++) {
    const sources = Array.from({ length: 5 }, (_, source) => `z-source-${index}-${source}`);
    sources.forEach(id => seed(id, ['a']));
    seed(`a-linked-${index}`, [], sources);
  }
  const response = await listPools({
    url: 'http://localhost/api/admin/vocabulary-pools?sortBy=name&sortOrder=asc&limit=100',
  } as NextRequest);
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.pools).toHaveLength(100);
  expect(data.pools.every((pool: Data) => pool.id.startsWith('a-linked-') && pool.metadata.wordCount === 1)).toBe(true);
});

test.each([0, 200])('finishes a catalog scan at an exact read-batch boundary (%i pools)', async count => {
  mockDb.docs.clear();
  for (let index = 0; index < count; index++) seed(`pool-${index}`, []);
  const response = await listByCount({ limit: '100' });
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.pools).toHaveLength(Math.min(count, 100));
  expect(data.hasMore).toBe(count > 100);
  expect(mockDb.queryReads.at(-1)?.count).toBe(0);
});

test('still rejects a single linked dependency graph above 500 pools', async () => {
  for (let index = 0; index < 501; index++) seed(`graph-${index}`, [], index < 500 ? [`graph-${index + 1}`] : []);
  const response = await listByCount();
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe('VOCABULARY_POOL_GRAPH_TOO_LARGE');
});

test.each(['missing', 'filtered', 'pending', 'deleting'])(
  'rejects a %s word-count cursor with the existing stale-cursor response',
  async state => {
    seed('cursor', []);
    if (state === 'missing') mockDb.docs.delete(poolPath('cursor'));
    if (state === 'filtered') mockDb.docs.get(poolPath('cursor'))!.metadata.difficulty = 'advanced';
    if (state === 'pending') mockDb.docs.get(poolPath('cursor'))!._creationPending = {};
    if (state === 'deleting') mockDb.docs.get(poolPath('cursor'))!._deletionPending = true;
    const response = await listByCount({ lastPoolId: 'cursor', difficulty: 'beginner' });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('VOCABULARY_POOL_CURSOR_STALE');
  }
);

test('rejects unauthorized catalog reads before querying any pool', async () => {
  mockAuthorized = false;
  const collection = jest.spyOn(mockDb, 'collection');
  const response = await listByCount();
  expect(response.status).toBe(401);
  expect(collection).not.toHaveBeenCalled();
});
