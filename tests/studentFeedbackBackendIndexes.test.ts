import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexes = JSON.parse(readFileSync(resolve(process.cwd(), 'firestore.indexes.json'), 'utf8')) as {
  indexes: Array<{ collectionGroup: string; queryScope: string; fields: Array<Record<string, string>> }>;
  fieldOverrides: Array<{ collectionGroup: string; fieldPath: string; indexes: unknown[] }>;
};

describe('feedback query index coverage', () => {
  // Firestore merges these per-filter indexes, so any filter combination shares one sort order.
  it.each([
    ['archived', { order: 'ASCENDING' }],
    ['status', { order: 'ASCENDING' }],
    ['type', { order: 'ASCENDING' }],
    ['severity', { order: 'ASCENDING' }],
    ['lesson.id', { order: 'ASCENDING' }],
    ['submitter.uid', { order: 'ASCENDING' }],
    ['submitter.emailNormalized', { order: 'ASCENDING' }],
    ['areas', { arrayConfig: 'CONTAINS' }],
  ])('indexes %s with both creation-time sort directions and document-ID ties', (field, mode) => {
    for (const direction of ['ASCENDING', 'DESCENDING']) {
      expect(indexes.indexes).toContainEqual({
        collectionGroup: 'studentFeedback',
        queryScope: 'COLLECTION',
        fields: [
          { fieldPath: field, ...mode },
          { fieldPath: 'createdAt', order: direction },
          { fieldPath: '__name__', order: direction },
        ],
      });
    }
  });

  it.each(['description', 'comments', 'otherAreaExplanation', 'attachments', 'diagnostics'])(
    'excludes unqueried report field %s from automatic indexes',
    field => {
      expect(indexes.fieldOverrides).toContainEqual({ collectionGroup: 'studentFeedback', fieldPath: field, indexes: [] });
    }
  );
});
