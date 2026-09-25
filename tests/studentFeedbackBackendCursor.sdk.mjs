import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { applyFeedbackDateBounds } from '../src/lib/student-feedback/query-bounds.ts';

const require = createRequire(import.meta.url);
const { Firestore, FieldPath } = require('@google-cloud/firestore');
const db = new Firestore({ projectId: 'demo-feedback-cursor' });
const early = '2026-09-23T08:00:00.000Z';
const late = '2026-09-24T08:00:00.000Z';

function base(sort) {
  const direction = sort === 'oldest' ? 'asc' : 'desc';
  return db.collection('studentFeedback').orderBy('createdAt', direction).orderBy(FieldPath.documentId(), direction);
}

function values(cursor) {
  return cursor?.values.map(value => value.stringValue ?? value.referenceValue);
}

for (const sort of ['newest', 'oldest']) {
  const initial = applyFeedbackDateBounds(base(sort), { sort, from: early, to: late });
  const firstBound = sort === 'oldest' ? early : late;
  const finalBound = sort === 'oldest' ? late : early;
  assert.deepEqual(values(initial._queryOptions.startAt), [firstBound]);
  assert.deepEqual(values(initial._queryOptions.endAt), [finalBound]);
  // A timestamp-only inclusive bound includes every document-ID tie at that time.
  assert.equal(initial._queryOptions.startAt.before, true);
  assert.equal(initial._queryOptions.endAt.before, false);

  const page = applyFeedbackDateBounds(base(sort), {
    sort, from: early, to: late,
    cursor: { createdAt: late, id: 'report-at-boundary' },
  });
  assert.deepEqual(values(page._queryOptions.startAt), [
    late,
    'projects/demo-feedback-cursor/databases/(default)/documents/studentFeedback/report-at-boundary',
  ]);
  assert.equal(page._queryOptions.startAt.before, false);
  assert.deepEqual(values(page._queryOptions.endAt), [finalBound]);
}

console.log('Verified inclusive date ties and stable pagination cursors with the real Firestore Admin SDK.');
