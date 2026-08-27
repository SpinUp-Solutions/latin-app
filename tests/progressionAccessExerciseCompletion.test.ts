jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));

import { getLessonProgressAccessInTransaction } from '@/src/lib/learning-units/progression-access';

type Data = Record<string, unknown>;

interface FakeDocumentRef {
  kind: 'document';
  collection: string;
  id: string;
}

class FakeQuery {
  readonly kind = 'query';
  private filter?: { field: string; value: unknown };
  private selectedFields?: string[];

  constructor(
    readonly collection: string,
    private readonly collections: Record<string, Record<string, Data>>
  ) {}

  doc(id: string): FakeDocumentRef {
    return { kind: 'document', collection: this.collection, id };
  }

  where(field: string, _operator: string, value: unknown) {
    this.filter = { field, value };
    return this;
  }

  select(...fields: string[]) {
    this.selectedFields = fields;
    return this;
  }

  documents() {
    return Object.entries(this.collections[this.collection] ?? {})
      .filter(([, data]) => !this.filter || data[this.filter.field] === this.filter.value)
      .map(([id, data]) => {
        const selected = this.selectedFields
          ? Object.fromEntries(
              this.selectedFields.filter(field => data[field] !== undefined).map(field => [field, data[field]])
            )
          : data;
        return fakeSnapshot(this.doc(id), selected);
      });
  }
}

function fakeSnapshot(ref: FakeDocumentRef, data?: Data) {
  return {
    id: ref.id,
    ref,
    exists: data !== undefined,
    data: () => data,
  };
}

describe('transactional lesson progression access', () => {
  it('unlocks from canonical legacy exercise evidence', async () => {
    const collections: Record<string, Record<string, Data>> = {
      lessons: {
        first: {
          id: 'first',
          kind: 'lesson',
          title: 'First',
          description: '',
          type: 'normal',
          version: 2,
          pages: [{ id: 'page-1', items: [{ id: 'exercise-a', type: 'fill', title: 'A' }] }],
          totalPages: 1,
          totalItems: 1,
          totalExercises: 1,
          isLive: true,
          liveOrder: 0,
          publishedAt: 'before',
          publishedBy: 'admin',
        },
        second: {
          id: 'second',
          kind: 'lesson',
          title: 'Second',
          description: '',
          type: 'normal',
          pages: [{ id: 'page-1', items: [] }],
          isLive: true,
          liveOrder: 1,
          publishedAt: 'before',
          publishedBy: 'admin',
        },
      },
      learningPaths: {
        default: {
          id: 'default',
          revision: 1,
          unitIds: ['first', 'second'],
          updatedAt: 'before',
          updatedBy: 'admin',
        },
      },
      userProgress: {
        user_first: {
          userId: 'user',
          lessonId: 'first',
          status: 'in-progress',
          progressSchemaVersion: 2,
          exerciseProgress: [{ exerciseId: 'exercise-a', score: 100, completedAt: 'before' }],
          lastAccessedAt: 'before',
        },
      },
    };
    const db = {
      collection: (name: string) => new FakeQuery(name, collections),
    };
    const transaction = {
      get: async (reference: FakeDocumentRef | FakeQuery) => {
        if (reference instanceof FakeQuery) return { docs: reference.documents() };
        return fakeSnapshot(reference, collections[reference.collection]?.[reference.id]);
      },
      getAll: async (...inputs: Array<FakeDocumentRef | { fieldMask: string[] }>) => {
        const options = inputs.at(-1);
        const fieldMask = options && 'fieldMask' in options ? options.fieldMask : undefined;
        const refs = (fieldMask ? inputs.slice(0, -1) : inputs) as FakeDocumentRef[];
        return refs.map(ref => {
          const data = collections[ref.collection]?.[ref.id];
          const selected =
            data && fieldMask
              ? Object.fromEntries(fieldMask.filter(field => data[field] !== undefined).map(field => [field, data[field]]))
              : data;
          return fakeSnapshot(ref, selected);
        });
      },
    };

    await expect(
      getLessonProgressAccessInTransaction(
        transaction as never,
        db as never,
        { id: 'second', type: 'normal', isLive: true },
        'user',
        false
      )
    ).resolves.toBe('allowed');
  });
});
