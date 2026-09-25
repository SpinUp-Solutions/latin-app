import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { applyFeedbackDateBounds } from '../src/lib/student-feedback/query-bounds.ts';

const require = createRequire(import.meta.url);
const { Firestore, FieldPath } = require('@google-cloud/firestore');
const db = new Firestore({ projectId: process.env.GCLOUD_PROJECT || 'demo-latin-app' });
const root = db.collection('studentFeedback');
const early = '2026-09-23T08:00:00.000Z';
const late = '2026-09-24T08:00:00.000Z';

try {
  for (const [id, createdAt] of [['a', early], ['b', early], ['c', late], ['d', late]]) {
    await root.doc(`cursor-test-${id}`).set({ createdAt, archived: false, status: 'unresolved' });
  }

  for (const sort of ['newest', 'oldest']) {
    const direction = sort === 'oldest' ? 'asc' : 'desc';
    const base = () => root.where('archived', '==', false).where('status', '==', 'unresolved')
      .orderBy('createdAt', direction).orderBy(FieldPath.documentId(), direction);
    const first = await applyFeedbackDateBounds(base(), { sort, from: early, to: late }).limit(2).get();
    const firstIds = first.docs.map(document => document.id);
    assert.deepEqual(firstIds, sort === 'oldest' ? ['cursor-test-a', 'cursor-test-b'] : ['cursor-test-d', 'cursor-test-c']);
    const last = first.docs.at(-1);
    const second = await applyFeedbackDateBounds(base(), {
      sort, from: early, to: late,
      cursor: { createdAt: last.get('createdAt'), id: last.id },
    }).limit(2).get();
    assert.deepEqual(second.docs.map(document => document.id),
      sort === 'oldest' ? ['cursor-test-c', 'cursor-test-d'] : ['cursor-test-b', 'cursor-test-a']);
    const tied = await applyFeedbackDateBounds(base(), { sort, from: late, to: late }).get();
    assert.deepEqual(tied.docs.map(document => document.id),
      sort === 'oldest' ? ['cursor-test-c', 'cursor-test-d'] : ['cursor-test-d', 'cursor-test-c']);
  }

  console.log('Verified exact-date ties and two-page newest/oldest cursors against Firestore emulator.');
} finally {
  await db.terminate();
}
