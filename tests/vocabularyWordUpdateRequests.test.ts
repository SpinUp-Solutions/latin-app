jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  get adminDb() {
    return mockDb;
  },
}));

import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import { GET as listRequests, POST as stageRequest } from '@/src/app/api/admin/vocabulary-word-update-requests/route';
import {
  GET as getRequest,
  PATCH as saveProposal,
} from '@/src/app/api/admin/vocabulary-word-update-requests/[id]/route';
import { POST as approveRequest } from '@/src/app/api/admin/vocabulary-word-update-requests/[id]/approve/route';
import { POST as dismissRequest } from '@/src/app/api/admin/vocabulary-word-update-requests/[id]/dismiss/route';
import type { VocabularyWordUpdateRequestDetail } from '@/shared/types/vocabulary/update-requests';

type Data = Record<string, unknown>;
type Filter = [field: string, value: unknown];
type FakeRef = { kind: 'doc'; collection: string; id: string; get: () => Promise<FakeSnapshot> };
type FakeQuery = {
  kind: 'query';
  collection: string;
  filters: Filter[];
  limitValue: number;
  where: (field: string, operator: string, value: unknown) => FakeQuery;
  select: (...fields: string[]) => FakeQuery;
  limit: (value: number) => FakeQuery;
  get: () => Promise<{ docs: FakeSnapshot[]; empty: boolean }>;
};
type FakeSnapshot = {
  id: string;
  exists: boolean;
  updateTime?: { seconds: number; nanoseconds: number };
  data: () => Data | undefined;
};

const WORDS = 'vocabulary_words_v5';

/** A deep copy that keeps dates, so stored data cannot be changed through a snapshot. */
const clone = <T>(value: T): T => {
  if (value instanceof Date) return new Date(value) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)])) as T;
  }
  return value;
};
const UPDATES = 'vocabulary_word_update_requests';

/** In-memory Firestore whose update times move on every write, like the real one. */
class FakeFirestore {
  docs = new Map<string, Map<string, { data: Data; version: number }>>();
  private clock = 1;
  private autoId = 0;

  seed(collection: string, id: string, data: Data) {
    if (!this.docs.has(collection)) this.docs.set(collection, new Map());
    this.docs.get(collection)!.set(id, { data: clone(data), version: this.clock++ });
  }

  read(collection: string, id: string) {
    return this.docs.get(collection)?.get(id)?.data;
  }

  private snapshot(collection: string, id: string): FakeSnapshot {
    const stored = this.docs.get(collection)?.get(id);
    return {
      id,
      exists: stored !== undefined,
      updateTime: stored ? { seconds: stored.version, nanoseconds: 0 } : undefined,
      data: () => (stored ? clone(stored.data) : undefined),
    };
  }

  private ref(collection: string, id: string): FakeRef {
    return { kind: 'doc', collection, id, get: async () => this.snapshot(collection, id) };
  }

  private query(collection: string, filters: Filter[] = [], limitValue = Infinity): FakeQuery {
    const query: FakeQuery = {
      kind: 'query',
      collection,
      filters,
      limitValue,
      where: (field, _operator, value) => this.query(collection, [...filters, [field, value]], limitValue),
      select: () => query,
      limit: value => this.query(collection, filters, value),
      get: async () => this.run(query),
    };
    return query;
  }

  private run(query: FakeQuery) {
    const docs = [...(this.docs.get(query.collection)?.entries() ?? [])]
      .filter(([, stored]) => query.filters.every(([field, value]) => stored.data[field] === value))
      .slice(0, query.limitValue)
      .map(([id]) => this.snapshot(query.collection, id));
    return { docs, empty: docs.length === 0 };
  }

  collection(collection: string) {
    return {
      doc: (id?: string) => this.ref(collection, id ?? `auto-${++this.autoId}`),
      where: (field: string, operator: string, value: unknown) => this.query(collection).where(field, operator, value),
    };
  }

  async runTransaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = [];
    const result = await callback({
      get: async (target: FakeRef | FakeQuery) =>
        target.kind === 'query' ? this.run(target) : this.snapshot(target.collection, target.id),
      create: (ref: FakeRef, data: Data) =>
        writes.push(() => {
          if (this.read(ref.collection, ref.id)) throw new Error('already exists');
          this.seed(ref.collection, ref.id, data);
        }),
      set: (ref: FakeRef, data: Data, options?: { merge?: boolean }) =>
        writes.push(() =>
          this.seed(ref.collection, ref.id, { ...(options?.merge ? this.read(ref.collection, ref.id) : {}), ...data })
        ),
      update: (ref: FakeRef, data: Data) =>
        writes.push(() => this.seed(ref.collection, ref.id, { ...this.read(ref.collection, ref.id), ...data })),
    });
    writes.forEach(write => write());
    return result;
  }
}

let mockDb: FakeFirestore;

/** A full third-declension table built from a stem, so a test can change every form's macrons at once. */
const declension = (nominative: string, stem: string) => ({
  nominative: { singular: [nominative], plural: [`${stem}ēs`] },
  genitive: { singular: [`${stem}is`], plural: [`${stem}um`] },
  dative: { singular: [`${stem}ī`], plural: [`${stem}ibus`] },
  accusative: { singular: [`${stem}em`], plural: [`${stem}ēs`] },
  ablative: { singular: [`${stem}e`], plural: [`${stem}ibus`] },
  vocative: { singular: [nominative], plural: [`${stem}ēs`] },
  locative: { singular: null, plural: null },
});

const liveWord = {
  word: 'ardor',
  part_of_speech: 'noun',
  translation: 'fire, heat',
  definitions: ['passion'],
  etymology: 'From ardeō',
  pronunciation: '/ˈar.dor/',
  type: 'core',
  alternate_form: null,
  dictionary_entry: 'ardor, ardōris',
  sort_key: 'ardor',
  random_index: 0.42,
  gender: 'masculine',
  declension: '3',
  nominative_singular: { full_form: 'ardor', shortened_form: 'ardor' },
  genitive_singular: { full_form: 'ardōris', shortened_form: '-ōris' },
  declension_table: declension('ardor', 'ardōr'),
  createdAt: new Date('2026-05-12T00:00:00.000Z'),
  updatedAt: new Date('2026-05-12T00:00:00.000Z'),
  _poolReferenceRevision: 3,
};

const { createdAt: _createdAt, updatedAt: _updatedAt, _poolReferenceRevision: _revision, ...authored } = liveWord;
const proposal = {
  ...authored,
  word: 'ārdor',
  pronunciation: '/ˈaːr.dor/',
  dictionary_entry: 'ārdor, ārdōris',
  declension_table: declension('ārdor', 'ārdōr'),
};

const request = (url: string, body: unknown = {}) => ({ url, json: async () => body }) as never;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
type Response<T = Record<string, unknown>> = { status: number; body: T };

async function stage(body: Data = {}) {
  return (await stageRequest(
    request('http://localhost/api/admin/vocabulary-word-update-requests', {
      wordId: 'ardor',
      proposedWord: proposal,
      reason: 'Wiktionary marks the a long',
      source: 'vocab audit',
      ...body,
    })
  )) as unknown as Response<{ id: string; created: boolean; code?: string }>;
}

async function detail(id: string) {
  return (await getRequest(request(`http://localhost/x/${id}`), params(id))) as unknown as Response<
    VocabularyWordUpdateRequestDetail & { code?: string }
  >;
}

async function approve(id: string, body?: Data) {
  const current = (await detail(id)).body;
  return (await approveRequest(
    request(`http://localhost/x/${id}/approve`, {
      version: current.request.version,
      wordFingerprint: current.liveFingerprint,
      ...body,
    }),
    params(id)
  )) as unknown as Response<VocabularyWordUpdateRequestDetail & { code?: string }>;
}

beforeEach(() => {
  mockDb = new FakeFirestore();
  mockDb.seed(WORDS, 'ardor', liveWord);
  jest.mocked(verifyAdminAccess).mockResolvedValue({ uid: 'admin-1' } as never);
});

describe('staging a word update', () => {
  it('stores the proposal with the live word as its base and summarizes what changes', async () => {
    const response = await stage();

    expect(response.status).toBe(201);
    const { body } = await detail(response.body.id);
    expect(body.request).toMatchObject({
      status: 'pending',
      wordId: 'ardor',
      word: 'ārdor',
      reason: 'Wiktionary marks the a long',
      source: 'vocab audit',
      changes: { fields: ['dictionary_entry', 'pronunciation', 'word'], tableCells: 12 },
      baseFingerprint: body.liveFingerprint,
    });
    expect(body.request.proposedWord).toMatchObject({ sort_key: 'ardor', random_index: 0.42 });
    expect(body.request.baseWord).not.toHaveProperty('_poolReferenceRevision');
    expect(mockDb.read(WORDS, 'ardor')).toMatchObject({ word: 'ardor' });
  });

  it('returns the first request when the same idempotency key is staged again', async () => {
    const first = await stage({ idempotencyKey: 'audit-2026-11:ardor' });
    const again = await stage({ idempotencyKey: 'audit-2026-11:ardor' });
    const different = await stage({
      idempotencyKey: 'audit-2026-11:ardor',
      proposedWord: { ...proposal, translation: 'zeal' },
    });

    expect(first.status).toBe(201);
    expect(again).toMatchObject({ status: 200, body: { id: first.body.id, created: false } });
    expect(different).toMatchObject({ status: 409, body: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(mockDb.docs.get(UPDATES)!.size).toBe(1);
  });

  it.each([
    ['a word that does not exist', { wordId: 'missing' }, 404, 'WORD_NOT_FOUND'],
    [
      'a change of part of speech',
      { proposedWord: { ...proposal, part_of_speech: 'verb' } },
      400,
      'VOCABULARY_UPDATE_PART_OF_SPEECH',
    ],
    ['a proposal identical to the word', { proposedWord: authored }, 400, 'VOCABULARY_UPDATE_NO_CHANGES'],
    ['an invalid word', { proposedWord: { ...proposal, translation: '' } }, 400, 'INVALID_WORD_DATA'],
    ['a proposal made from an older version', { baseFingerprint: '0:0' }, 409, 'WORD_CHANGED_SINCE_PROPOSAL'],
  ])('rejects %s', async (_case, body, status, code) => {
    const response = await stage(body);

    expect(response).toMatchObject({ status, body: { code } });
    expect(mockDb.docs.get(UPDATES)?.size ?? 0).toBe(0);
  });

  it('rejects a word that is being deleted', async () => {
    mockDb.seed(WORDS, 'ardor', { ...liveWord, _deletionPending: { actorUid: 'admin-2' } });

    expect(await stage()).toMatchObject({ status: 409, body: { code: 'WORD_DELETE_IN_PROGRESS' } });
  });

  it('allows one pending update per word', async () => {
    const first = await stage();
    const second = await stage({ proposedWord: { ...proposal, translation: 'zeal' } });

    expect(second).toMatchObject({
      status: 409,
      body: { code: 'VOCABULARY_UPDATE_ALREADY_PENDING', requestId: first.body.id },
    });
  });
});

describe('listing word updates', () => {
  it('lists summaries for one status', async () => {
    const { body } = await stage();

    const response = (await listRequests(
      request('http://localhost/api/admin/vocabulary-word-update-requests?status=pending')
    )) as unknown as Response<{ requests: Data[]; truncated: boolean }>;

    expect(response.status).toBe(200);
    expect(response.body.truncated).toBe(false);
    expect(response.body.requests).toEqual([
      expect.objectContaining({ id: body.id, word: 'ārdor', translation: 'fire, heat', part_of_speech: 'noun' }),
    ]);
    expect(response.body.requests[0]).not.toHaveProperty('proposedWord');
  });
});

describe('approving a word update', () => {
  it('writes the proposal and keeps the creation time, random index and pool bookkeeping', async () => {
    const { body } = await stage({ proposedWord: { ...proposal, etymology: null } });

    const response = await approve(body.id);

    expect(response.status).toBe(200);
    const word = mockDb.read(WORDS, 'ardor')!;
    expect(word).toMatchObject({
      word: 'ārdor',
      sort_key: 'ardor',
      etymology: null,
      random_index: 0.42,
      createdAt: liveWord.createdAt,
      _poolReferenceRevision: 3,
      declension_table: declension('ārdor', 'ārdōr'),
    });
    expect((word.updatedAt as Date).getTime()).toBeGreaterThan(liveWord.updatedAt.getTime());
    expect(mockDb.read('vocabulary_content_state', 'global')).toMatchObject({ revision: 1 });
    expect(response.body.request).toMatchObject({
      status: 'approved',
      approvedBy: 'admin-1',
      appliedFromWord: expect.objectContaining({ word: 'ardor' }),
    });
  });

  it('removes an optional field the proposal leaves out and keeps fields the schema does not know', async () => {
    const preposition = {
      word: 'ad',
      part_of_speech: 'preposition',
      translation: 'to',
      definitions: [],
      etymology: null,
      pronunciation: null,
      type: 'core',
      alternate_form: null,
      dictionary_entry: null,
      sort_key: 'ad',
      random_index: 0.1,
      case: 'accusative',
      createdAt: new Date('2026-05-12T00:00:00.000Z'),
      updatedAt: new Date('2026-05-12T00:00:00.000Z'),
    };
    mockDb.seed(WORDS, 'ad', { ...preposition, legacy_note: 'kept' });
    const { case: _case, createdAt: _created, updatedAt: _updated, ...rest } = preposition;
    const { body } = await stage({ wordId: 'ad', proposedWord: { ...rest, translation: 'towards' } });

    expect((await approve(body.id)).status).toBe(200);
    const word = mockDb.read(WORDS, 'ad')!;
    expect(word).toMatchObject({ translation: 'towards', legacy_note: 'kept' });
    expect(word).not.toHaveProperty('case');
  });

  it('refuses when the word changed after the reviewer opened the update', async () => {
    const { body } = await stage();
    const opened = (await detail(body.id)).body;
    mockDb.seed(WORDS, 'ardor', { ...liveWord, translation: 'zeal' });

    const response = await approve(body.id, { wordFingerprint: opened.liveFingerprint });

    expect(response).toMatchObject({ status: 409, body: { code: 'WORD_CHANGED_SINCE_REVIEW' } });
    expect(mockDb.read(WORDS, 'ardor')).toMatchObject({ word: 'ardor', translation: 'zeal' });
  });

  it('refuses when the proposal changed after the reviewer opened it', async () => {
    const { body } = await stage();
    const opened = (await detail(body.id)).body;
    await saveProposal(
      request(`http://localhost/x/${body.id}`, {
        proposedWord: { ...proposal, translation: 'zeal' },
        version: opened.request.version,
      }),
      params(body.id)
    );

    const response = await approve(body.id, { version: opened.request.version });

    expect(response).toMatchObject({ status: 409, body: { code: 'VOCABULARY_UPDATE_CHANGED' } });
    expect(mockDb.read(WORDS, 'ardor')).toMatchObject({ word: 'ardor' });
  });

  it('refuses during production content sync without writing', async () => {
    const { body } = await stage();
    mockDb.seed('content_sync_locks', 'prod-content-to-dev', { ownerId: 'sync-1' });

    const response = await approve(body.id);

    expect(response).toMatchObject({ status: 409, body: { code: 'VOCABULARY_CONTENT_SYNC_IN_PROGRESS' } });
    expect(mockDb.read(WORDS, 'ardor')).toMatchObject({ word: 'ardor' });
  });

  it('refuses a request that is no longer pending', async () => {
    const { body } = await stage();
    await approve(body.id);

    expect(await approve(body.id)).toMatchObject({ status: 409, body: { code: 'VOCABULARY_UPDATE_NOT_PENDING' } });
  });
});

describe('editing and dismissing a word update', () => {
  it('saves the reviewer edit and recomputes the summary', async () => {
    const { body } = await stage();
    const opened = (await detail(body.id)).body;

    const response = (await saveProposal(
      request(`http://localhost/x/${body.id}`, {
        proposedWord: { ...authored, translation: 'zeal' },
        version: opened.request.version,
      }),
      params(body.id)
    )) as unknown as Response<VocabularyWordUpdateRequestDetail>;

    expect(response.status).toBe(200);
    expect(response.body.request).toMatchObject({
      translation: 'zeal',
      changes: { fields: ['translation'], tableCells: 0 },
    });
    expect(response.body.request.version).not.toBe(opened.request.version);
  });

  it('dismisses without touching the word', async () => {
    const { body } = await stage();

    const response = (await dismissRequest(
      request(`http://localhost/x/${body.id}/dismiss`, { reason: 'Not needed' }),
      params(body.id)
    )) as unknown as Response<VocabularyWordUpdateRequestDetail>;

    expect(response.body.request).toMatchObject({
      status: 'dismissed',
      dismissedBy: 'admin-1',
      dismissedReason: 'Not needed',
    });
    expect(mockDb.read(WORDS, 'ardor')).toMatchObject({ word: 'ardor' });
  });
});

it('requires an admin for every route', async () => {
  jest.mocked(verifyAdminAccess).mockRejectedValue(new AdminAccessError('Admin access required', 403));
  const responses = (await Promise.all([
    listRequests(request('http://localhost/x?status=pending')),
    stageRequest(request('http://localhost/x', { wordId: 'ardor', proposedWord: proposal })),
    getRequest(request('http://localhost/x/1'), params('1')),
    saveProposal(request('http://localhost/x/1', { proposedWord: proposal, version: '1:0' }), params('1')),
    approveRequest(request('http://localhost/x/1', { version: '1:0', wordFingerprint: '1:0' }), params('1')),
    dismissRequest(request('http://localhost/x/1'), params('1')),
  ])) as unknown as Response[];

  expect(responses.map(response => response.status)).toEqual([403, 403, 403, 403, 403, 403]);
  expect(mockDb.docs.get(UPDATES)).toBeUndefined();
});
