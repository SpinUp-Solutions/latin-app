import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

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
  const paths = [
    'studentFeedback/report-1',
    'studentFeedback/report-1/activity/note-1',
    'studentFeedbackSessions/session-1',
    'studentFeedbackSessions/session-1/attachments/file-1',
    'studentFeedbackThrottles/student-1',
  ];
  await environment.withSecurityRulesDisabled(async context => {
    const seedDb = context.firestore();
    for (const path of paths) await setDoc(doc(seedDb, path), { value: true });
  });

  const contexts = [
    environment.authenticatedContext('student-1'),
    environment.authenticatedContext('student-2'),
    environment.authenticatedContext('admin-1', { role: 'admin' }),
    environment.unauthenticatedContext(),
  ];
  for (const context of contexts) {
    const db = context.firestore();
    for (const path of paths) {
      const reference = doc(db, path);
      await assertFails(getDoc(reference));
      await assertFails(setDoc(doc(db, `${path}-new`), { value: true }));
      await assertFails(updateDoc(reference, { value: false }));
      await assertFails(deleteDoc(reference));
      await assertFails(getDocs(collection(db, path.split('/').slice(0, -1).join('/'))));
    }
  }

  console.log('Verified feedback reports, activity, sessions, reservations and throttles deny direct client access.');
} finally {
  await environment.cleanup();
}
