import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexes = JSON.parse(readFileSync(resolve(process.cwd(), 'firestore.indexes.json'), 'utf8')) as {
  indexes: Array<{ collectionGroup: string; queryScope: string; fields: Array<{ fieldPath: string; order: string }> }>;
  fieldOverrides: Array<{ collectionGroup: string; fieldPath: string; indexes: unknown[] }>;
};

describe('feedback query index coverage', () => {
  it.each([
    'archived', 'status', 'type', 'severity', 'lesson.id', 'submitter.uid', 'submitter.emailNormalized',
    'areaFlags.lessons', 'areaFlags.exercises', 'areaFlags.vocabulary', 'areaFlags.dashboard',
    'areaFlags.account', 'areaFlags.performance', 'areaFlags.other',
  ])('indexes %s with both creation-time sort directions and document-ID ties', field => {
    for (const direction of ['ASCENDING', 'DESCENDING']) {
      expect(indexes.indexes).toContainEqual({
        collectionGroup: 'studentFeedback', queryScope: 'COLLECTION',
        fields: [
          { fieldPath: field, order: 'ASCENDING' },
          { fieldPath: 'createdAt', order: direction },
          { fieldPath: '__name__', order: direction },
        ],
      });
    }
  });

  it('indexes bounded expired-session cleanup and active attachment cleanup', () => {
    expect(indexes.indexes).toContainEqual({
      collectionGroup: 'studentFeedbackSessions', queryScope: 'COLLECTION',
      fields: [{ fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'expiresAtMs', order: 'ASCENDING' }],
    });
    expect(indexes.fieldOverrides).toContainEqual({
      collectionGroup: 'attachments', fieldPath: 'cleanupPending',
      indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' }],
    });
  });

  it.each(['description', 'comments', 'otherAreaExplanation', 'attachments', 'diagnostics'])(
    'excludes unqueried report field %s from automatic indexes', field => {
      expect(indexes.fieldOverrides).toContainEqual({ collectionGroup: 'studentFeedback', fieldPath: field, indexes: [] });
    }
  );
});
