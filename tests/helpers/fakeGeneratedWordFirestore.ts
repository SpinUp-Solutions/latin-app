export type FakeDocument = {
  id: string;
  data: Record<string, unknown>;
};

type Filter = { field: string; op: string; value: unknown };

const compareValues = (left: unknown, right: unknown): number => {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''));
};

const fieldValue = (doc: FakeDocument, field: string): unknown =>
  field === '__name__' ? doc.id : doc.data[field];

const matchesFilter = (doc: FakeDocument, filter: Filter): boolean => {
  const actual = fieldValue(doc, filter.field);
  switch (filter.op) {
    case '==':
      return actual === filter.value;
    case 'in':
      return Array.isArray(filter.value) && filter.value.includes(actual);
    case '>=':
      return compareValues(actual, filter.value) >= 0;
    case '<=':
      return compareValues(actual, filter.value) <= 0;
    case '<':
      return compareValues(actual, filter.value) < 0;
    case '>':
      return compareValues(actual, filter.value) > 0;
    default:
      return true;
  }
};

const toSnapshot = (doc: FakeDocument) => ({
  id: doc.id,
  data: () => doc.data,
});

class FakeQuery {
  constructor(
    private readonly docs: FakeDocument[],
    private readonly state: {
      filters: Filter[];
      orderBy?: string;
      limitCount?: number;
      startAfterId?: string;
    },
    private readonly limitCalls?: number[]
  ) {}

  where(field: string, op: string, value: unknown) {
    return new FakeQuery(
      this.docs,
      {
        ...this.state,
        filters: [...this.state.filters, { field, op, value }],
      },
      this.limitCalls
    );
  }

  orderBy(field: string) {
    return new FakeQuery(this.docs, { ...this.state, orderBy: field }, this.limitCalls);
  }

  limit(limitCount: number) {
    this.limitCalls?.push(limitCount);
    return new FakeQuery(this.docs, { ...this.state, limitCount }, this.limitCalls);
  }

  startAfter(snapshot: { id: string }) {
    return new FakeQuery(this.docs, { ...this.state, startAfterId: snapshot.id }, this.limitCalls);
  }

  async get() {
    let rows = this.docs.filter(doc => this.state.filters.every(filter => matchesFilter(doc, filter)));
    const orderField = this.state.orderBy;
    if (orderField) {
      rows = [...rows].sort((left, right) => {
        const ordered = compareValues(fieldValue(left, orderField), fieldValue(right, orderField));
        return ordered !== 0 ? ordered : left.id.localeCompare(right.id);
      });
    }
    if (this.state.startAfterId) {
      const cursor = this.docs.find(doc => doc.id === this.state.startAfterId);
      if (cursor && orderField) {
        rows = rows.filter(row => {
          const ordered = compareValues(fieldValue(row, orderField), fieldValue(cursor, orderField));
          if (ordered > 0) return true;
          if (ordered < 0) return false;
          return row.id > cursor.id;
        });
      } else {
        const index = rows.findIndex(row => row.id === this.state.startAfterId);
        if (index >= 0) rows = rows.slice(index + 1);
      }
    }
    if (this.state.limitCount !== undefined) rows = rows.slice(0, this.state.limitCount);
    const snapshots = rows.map(toSnapshot);
    return { docs: snapshots, size: snapshots.length };
  }
}

export function createFakeGeneratedWordDb(options: {
  words?: FakeDocument[];
  pools?: Array<{ id: string; wordDocIds: string[] }>;
  limitCalls?: number[];
}) {
  const collections: Record<string, FakeDocument[]> = {
    vocabulary_words_v5: options.words ?? [],
    vocabulary_pools: (options.pools ?? []).map(pool => ({
      id: pool.id,
      data: { wordDocIds: pool.wordDocIds },
    })),
  };

  const collection = (name: string) => {
    const docs = collections[name] ?? [];
    const query = new FakeQuery(docs, { filters: [] }, options.limitCalls);
    return Object.assign(query, {
      doc: (id: string) => ({
        get: async () => {
          const found = docs.find(doc => doc.id === id);
          return {
            id,
            exists: Boolean(found),
            data: () => found?.data,
          };
        },
      }),
    });
  };

  return { collection };
}
