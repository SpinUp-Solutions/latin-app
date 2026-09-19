const timestamp = '2026-07-20T12:00:00.000Z';
type StoredDocument = Record<string, unknown>;
type DocumentRef = { kind: 'document'; collection: string; id: string; get: () => Promise<DocumentSnapshot> };
type QueryState = {
  collection: string;
  filters: Array<[string, unknown]>;
  selectedFields?: string[];
  orderings: Array<[string, 'asc' | 'desc']>;
  limitCount?: number;
};
type QueryRef = QueryState & {
  kind: 'query';
  where: (field: string, operator: string, value: unknown) => QueryRef;
  select: (...fields: string[]) => QueryRef;
  orderBy: (field: string, direction?: 'asc' | 'desc') => QueryRef;
  limit: (count: number) => QueryRef;
  count: () => { get: () => Promise<{ data: () => { count: number } }> };
  get: () => Promise<{ docs: DocumentSnapshot[] }>;
};
type DocumentSnapshot = {
  id: string;
  exists: boolean;
  data: () => StoredDocument | undefined;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fieldValue = (document: StoredDocument, path: string) =>
  path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as StoredDocument)[key];
  }, document);

export class FakeFirestore {
  private readonly documents = new Map<string, Map<string, StoredDocument>>();
  private readonly documentVersions = new Map<string, number>();
  private autoId = 0;
  transactionCallbackCount = 0;
  readonly queryLog: Array<{ collection: string; selectedFields?: string[]; limitUsed: boolean }> = [];
  readonly writeLog: string[] = [];

  constructor() {
    this.seed('learningPaths', 'default', {
      id: 'default',
      revision: 1,
      unitIds: ['test-1'],
      updatedAt: timestamp,
      updatedBy: 'admin-1',
    });
  }

  private documentKey(collection: string, id: string) {
    return `${collection}/${id}`;
  }

  private version(collection: string, id: string) {
    return this.documentVersions.get(this.documentKey(collection, id)) ?? 0;
  }

  private incrementVersion(collection: string, id: string) {
    const key = this.documentKey(collection, id);
    this.documentVersions.set(key, (this.documentVersions.get(key) ?? 0) + 1);
  }

  seed(collection: string, id: string, data: StoredDocument) {
    const documents = this.documents.get(collection) ?? new Map<string, StoredDocument>();
    documents.set(id, clone(data));
    this.documents.set(collection, documents);
    this.incrementVersion(collection, id);
  }

  read(collection: string, id: string) {
    const value = this.documents.get(collection)?.get(id);
    return value ? clone(value) : undefined;
  }

  readAll(collection: string) {
    return [...(this.documents.get(collection)?.values() ?? [])].map(clone);
  }

  private snapshot(collection: string, id: string, selectedFields?: string[]): DocumentSnapshot {
    const stored = this.documents.get(collection)?.get(id);
    const projected =
      stored && selectedFields
        ? Object.fromEntries(selectedFields.map(field => [field, fieldValue(stored, field)]))
        : stored;
    return {
      id,
      exists: Boolean(stored),
      data: () => (projected ? clone(projected) : undefined),
    };
  }

  private executeQuery(state: QueryState) {
    const documents = this.documents.get(state.collection) ?? new Map<string, StoredDocument>();
    let entries = [...documents.entries()].filter(([, document]) =>
      state.filters.every(([field, expected]) => fieldValue(document, field) === expected)
    );
    for (const [field, direction] of [...state.orderings].reverse()) {
      entries = entries.sort((left, right) => {
        const leftValue = fieldValue(left[1], field) as string | number;
        const rightValue = fieldValue(right[1], field) as string | number;
        const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        return direction === 'desc' ? -comparison : comparison;
      });
    }
    if (state.limitCount !== undefined) entries = entries.slice(0, state.limitCount);
    return { docs: entries.map(([id]) => this.snapshot(state.collection, id, state.selectedFields)) };
  }

  private query(
    state: QueryState,
    logEntry?: { collection: string; selectedFields?: string[]; limitUsed: boolean }
  ): QueryRef {
    const make = (changes: Partial<QueryState>) => this.query({ ...state, ...changes }, logEntry);
    return {
      kind: 'query',
      ...state,
      where: (field, operator, value) => {
        if (operator !== '==') throw new Error(`Unsupported fake query operator ${operator}`);
        return make({ filters: [...state.filters, [field, value]] });
      },
      select: (...fields) => {
        const entry = { collection: state.collection, selectedFields: fields, limitUsed: false };
        this.queryLog.push(entry);
        return this.query({ ...state, selectedFields: fields }, entry);
      },
      orderBy: (field, direction = 'asc') => make({ orderings: [...state.orderings, [field, direction]] }),
      limit: count => {
        if (logEntry) logEntry.limitUsed = true;
        else
          this.queryLog.push({ collection: state.collection, selectedFields: state.selectedFields, limitUsed: true });
        return make({ limitCount: count });
      },
      count: () => ({
        get: async () => ({
          data: () => ({
            count: this.executeQuery({ ...state, selectedFields: undefined, limitCount: undefined }).docs.length,
          }),
        }),
      }),
      get: async () => this.executeQuery(state),
    };
  }

  collection = (collection: string) => {
    const query = this.query({ collection, filters: [], orderings: [] });
    return Object.assign(query, {
      doc: (id?: string): DocumentRef => {
        const documentId = id ?? `attempt-${++this.autoId}`;
        return {
          kind: 'document',
          collection,
          id: documentId,
          get: async () => this.snapshot(collection, documentId),
        };
      },
    });
  };

  runTransaction = <T>(callback: (transaction: unknown) => Promise<T>): Promise<T> => {
    const execute = async (retryCount = 0): Promise<T> => {
      if (retryCount > 5) throw new Error('Fake transaction retry limit exceeded');
      this.transactionCallbackCount += 1;
      const readVersions = new Map<string, number>();
      const writes: Array<{ mode: 'create' | 'set' | 'delete'; ref: DocumentRef; value?: StoredDocument }> = [];
      const assertReadsPrecedeWrites = () => {
        if (writes.length > 0) throw new Error('Fake transaction read after a write was queued');
      };
      const transaction = {
        get: async (target: DocumentRef | QueryRef) => {
          assertReadsPrecedeWrites();
          if (target.kind === 'document') {
            const key = this.documentKey(target.collection, target.id);
            if (!readVersions.has(key)) readVersions.set(key, this.version(target.collection, target.id));
            return this.snapshot(target.collection, target.id);
          }
          return this.executeQuery(target);
        },
        getAll: async (...args: Array<DocumentRef | { fieldMask?: string[] }>) => {
          assertReadsPrecedeWrites();
          const refs = args.filter((arg): arg is DocumentRef => (arg as DocumentRef).kind === 'document');
          const options = args.find(
            (arg): arg is { fieldMask?: string[] } => (arg as { fieldMask?: string[] }).fieldMask !== undefined
          );
          return refs.map(ref => {
            const key = this.documentKey(ref.collection, ref.id);
            if (!readVersions.has(key)) readVersions.set(key, this.version(ref.collection, ref.id));
            return this.snapshot(ref.collection, ref.id, options?.fieldMask);
          });
        },
        create: (ref: DocumentRef, value: StoredDocument) => writes.push({ mode: 'create', ref, value: clone(value) }),
        set: (ref: DocumentRef, value: StoredDocument) => writes.push({ mode: 'set', ref, value: clone(value) }),
        delete: (ref: DocumentRef) => writes.push({ mode: 'delete', ref }),
      };

      const result = await callback(transaction);
      const hasConflict = [...readVersions.entries()].some(
        ([key, version]) => (this.documentVersions.get(key) ?? 0) !== version
      );
      if (hasConflict) return execute(retryCount + 1);

      for (const write of writes) {
        const documents = this.documents.get(write.ref.collection) ?? new Map<string, StoredDocument>();
        if (write.mode === 'create' && documents.has(write.ref.id)) throw new Error('Document already exists');
        if (write.mode === 'delete') documents.delete(write.ref.id);
        else documents.set(write.ref.id, clone(write.value!));
        this.documents.set(write.ref.collection, documents);
        this.incrementVersion(write.ref.collection, write.ref.id);
        this.writeLog.push(`${write.mode}:${write.ref.collection}/${write.ref.id}`);
      }
      return result;
    };

    return execute();
  };
}
