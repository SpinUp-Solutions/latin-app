import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-latin-app';
const [host = '127.0.0.1', rawPort = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host,
    port: Number(rawPort),
    rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});

try {
  const db = environment.authenticatedContext('student-1').firestore();
  const collections = [
    'testAttempts',
    'testAttemptSessions',
    'testAttemptSummaries',
    'testResultReviews',
    'studentMockResults',
  ];

  for (const collection of collections) {
    const reference = doc(db, collection, 'document-1');
    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { value: true }));
    await assertFails(deleteDoc(reference));
  }

  console.log(`Verified direct client denial for ${collections.length} test attempt collections.`);
} finally {
  await environment.cleanup();
}
