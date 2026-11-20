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
type FakeQuery = { kind: 'query'; collection: string; field: string; values: unknown[]; limitValue: number };

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
    return { id, exists: data !== undefined, data: () => data };
  }

  private query(collection: string, field: string, values: unknown[], limitValue = Infinity): FakeQuery & Data {
    return {
      kind: 'query',
      collection,
      field,
      values,
      limitValue,
      limit: (next: number) => this.query(collection, field, values, next),
      get: async () => this.run({ kind: 'query', collection, field, values, limitValue }),
    };
  }

  private run(query: FakeQuery) {
    const docs = [...(this.docs.get(query.collection)?.entries() ?? [])]
      .filter(([, data]) => query.values.includes(data[query.field]))
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
      where: (field: string, operator: string, value: unknown) => {
        if (operator !== 'in' || !Array.isArray(value)) throw new Error(`Unsupported query ${field} ${operator}`);
        return this.query(collection, field, value);
      },
    };
  }

  async runTransaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
    let writes = 0;
    // A refused transaction is counted too: it throws, and must have written nothing.
    try {
      return await callback({
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
