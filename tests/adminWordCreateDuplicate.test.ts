jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: jest.requireActual('@/src/lib/admin-access-error').AdminAccessError,
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  get adminDb() {
    return mockDb;
  },
}));

import { GET as listWords, POST as createWord } from '@/src/app/api/admin/words/route';

type Data = Record<string, unknown>;
type FakeRef = { kind: 'doc'; collection: string; id: string };
type KeyFilter = (data: Data) => boolean;
type FakeQuery = { kind: 'query'; collection: string; filter: KeyFilter; limitValue: number; after?: string };
jest.mock('firebase-admin/firestore', () => ({
  Filter: {
    where: (field: string, op: string, value: string) => (doc: Data) =>
      typeof doc[field] === 'string' && (op === '<' ? doc[field] < value : doc[field] >= value),
    and:
      (...filters: KeyFilter[]) =>
      (doc: Data) =>
        filters.every(filter => filter(doc)),
    or:
      (...filters: KeyFilter[]) =>
      (doc: Data) =>
        filters.some(filter => filter(doc)),
  },
}));

const WORDS = 'vocabulary_words_v5';

/** In-memory Firestore with the reads and writes word creation uses, counting each transaction's writes. */
class FakeFirestore {
  docs = new Map<string, Map<string, Data>>();
  writesPerTransaction: number[] = [];
  private nextId = 0;

  seed(collection: string, id: string, data: Data) {
    if (!this.docs.has(collection)) this.docs.set(collection, new Map());
    this.docs.get(collection)!.set(id, data);
  }

  words() {
    return [...(this.docs.get(WORDS)?.values() ?? [])];
  }

  private snapshot(collection: string, id: string) {
    const data = this.docs.get(collection)?.get(id);
    return { id, ref: { kind: 'doc', collection, id }, exists: data !== undefined, data: () => data };
  }

  private query(collection: string, filter: KeyFilter, limitValue = Infinity, after?: string): FakeQuery & Data {
    const q: FakeQuery = { kind: 'query', collection, filter, limitValue, after };
    return {
      ...q,
      select: () => this.query(collection, filter, limitValue, after),
      orderBy: () => this.query(collection, filter, limitValue, after),
      limit: (next: number) => this.query(collection, filter, next, after),
      startAfter: (doc: { id: string }) => this.query(collection, filter, limitValue, doc.id),
      get: async () => this.run(q),
    };
  }

  getAll = async (...refs: FakeRef[]) => refs.map(ref => this.snapshot(ref.collection, ref.id));

  private run(query: FakeQuery) {
    const docs = [...(this.docs.get(query.collection)?.entries() ?? [])]
      .filter(([id, data]) => (!query.after || id > query.after) && query.filter(data))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, query.limitValue)
      .map(([id]) => this.snapshot(query.collection, id));
    return { docs, empty: docs.length === 0 };
  }

  collection(collection: string) {
    return {
      doc: (id?: string) => {
        const docId = id ?? `new-${++this.nextId}`;
        return {
          kind: 'doc',
          collection,
          id: docId,
          get: async () => this.snapshot(collection, docId),
        };
      },
      where: (field: KeyFilter | string, _operator?: string, value?: string) =>
        this.query(collection, typeof field === 'string' ? data => data[field] === value : field),
    };
  }

  async runTransaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
    let writes = 0;
    // A refused transaction is counted too: it throws, and must have written nothing.
    try {
      return await callback({
        getAll: this.getAll,
        get: async (target: FakeRef | FakeQuery) =>
          target.kind === 'query' ? this.run(target) : this.snapshot(target.collection, target.id),
        set: (ref: FakeRef, data: Data) => {
          writes += 1;
          this.seed(ref.collection, ref.id, data);
        },
        create: (ref: FakeRef, data: Data) => {
          writes += 1;
          this.seed(ref.collection, ref.id, data);
        },
      });
    } finally {
      this.writesPerTransaction.push(writes);
    }
  }
}

let mockDb: FakeFirestore;

const stored = (word: string, part_of_speech = 'conjunction', extra: Data = {}) => ({
  word,
  part_of_speech,
  translation: 'with',
  definitions: [],
  etymology: null,
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: null,
  sort_key: word.normalize('NFD').replace(/̄/g, '').normalize('NFC'),
  random_index: 0.5,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...extra,
});

/** A new word as the editor sends it: no server-owned fields. */
const newWord = (word: string, part_of_speech = 'conjunction') => {
  const {
    sort_key: _sortKey,
    random_index: _random,
    createdAt: _created,
    updatedAt: _updated,
    ...rest
  } = stored(word, part_of_speech);
  return rest;
};

type Body = { code?: string; existingWords?: { id: string; word: string; part_of_speech: string }[]; data?: Data };
const post = async (body: Data) =>
  (await createWord({ url: 'http://localhost/api/admin/words', json: async () => body } as never)) as unknown as {
    status: number;
    body: Body;
  };

beforeEach(() => {
  mockDb = new FakeFirestore();
});

it('refuses a headword already in the vocabulary, reports the existing word, and writes nothing', async () => {
  mockDb.seed(WORDS, 'cum-prep', stored('cum', 'preposition'));

  const response = await post(newWord('cum'));

  expect(response.status).toBe(409);
  expect(response.body.code).toBe('WORD_ALREADY_EXISTS');
  expect(response.body.existingWords).toEqual([
    expect.objectContaining({ id: 'cum-prep', word: 'cum', part_of_speech: 'preposition' }),
  ]);
  expect(mockDb.words()).toHaveLength(1);
  expect(mockDb.writesPerTransaction).toEqual([0]);
});

it.each([
  ['macrons', 'rosa', 'rosā'],
  ['capitals', 'Roma', 'roma'],
  ['surrounding spaces', 'amo', ' amo '],
  ['stored capitals', 'ROMA', 'rōma'],
  ['stored mixed case', 'roMA', 'rōma'],
  ['stored padding', ' Roma ', 'rōma'],
  ['stored Unicode padding', '\u00a0Roma\u00a0', 'rōma'],
  ['stored trailing spaces', 'RoMA  ', 'rōma'],
  ['short padded word', ' A ', 'ā'],
])('matches the headword regardless of %s', async (_case, existing, added) => {
  mockDb.seed(WORDS, 'existing', stored(existing, 'noun'));
  const response = await post(newWord(added));
  expect(response.status).toBe(409);
  expect(response.body.existingWords?.map(word => word.id)).toEqual(['existing']);
});

it('creates a homograph once the admin confirms it, without sending the flag into the word', async () => {
  mockDb.seed(WORDS, 'cum-prep', stored('cum', 'preposition'));

  const response = await post({ ...newWord('cum'), allowDuplicate: true });

  expect(response.status).toBe(200);
  expect(mockDb.words()).toHaveLength(2);
  expect(mockDb.words()[1]).toMatchObject({ word: 'cum', part_of_speech: 'conjunction' });
  expect(mockDb.words()[1]).not.toHaveProperty('allowDuplicate');
});

it('creates a word whose headword is new, or whose only match is being deleted', async () => {
  mockDb.seed(WORDS, 'old-et', stored('et', 'conjunction', { _deletionPending: true }));
  mockDb.seed(WORDS, 'sed', stored('sed'));

  expect((await post(newWord('et'))).status).toBe(200);
  expect((await post(newWord('atque'))).status).toBe(200);
  expect(mockDb.words()).toHaveLength(4);
});

it('does not lose an active homograph behind a page of deletion-pending matches', async () => {
  for (let i = 0; i < 110; i++) mockDb.seed(WORDS, `deleted-${i}`, stored('ROMA', 'noun', { _deletionPending: true }));
  mockDb.seed(WORDS, 'live', stored('RoMA', 'noun'));
  expect((await post(newWord('rōma'))).body.existingWords?.map(word => word.id)).toEqual(['live']);
});

it('derives a canonical lookup key on create independently of the display spelling and sort key', async () => {
  const response = await post({ ...newWord(' RŌMA '), sort_key: 'wrong' });
  expect(response.status).toBe(200);
  expect(mockDb.words()).toMatchObject([{ word: ' RŌMA ', sort_key: 'ROMA', _headwordKey: 'roma' }]);
});

it('looks a headword up before the word is created, so the editor can warn before any AI run', async () => {
  mockDb.seed(WORDS, 'rosa', stored('rosa', 'noun'));
  mockDb.seed(WORDS, 'old-rosa', stored('rosa', 'noun', { _deletionPending: true }));
  mockDb.seed(WORDS, 'rosarium', stored('rosarium', 'noun'));

  const lookup = async (headword: string) =>
    (
      (await listWords({
        url: `http://localhost/api/admin/words?${new URLSearchParams({ headword })}`,
      } as never)) as unknown as { body: { data: { words: { id: string }[] } } }
    ).body.data.words.map(word => word.id);

  expect(await lookup('Rosā')).toEqual(['rosa']);
  expect(await lookup('silva')).toEqual([]);
  expect(await lookup('  ')).toEqual([]);
});
