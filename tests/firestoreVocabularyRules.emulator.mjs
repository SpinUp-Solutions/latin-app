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
  const db = environment.authenticatedContext('student-1').firestore();
  const collections = [
    'learningPathMigrations',
    'vocabulary_pools',
    'vocabulary_words_v5',
    'vocabulary_words_v4',
    'vocabulary_words_v6',
    'vocabulary_word_requests',
    'vocabulary_word_update_requests',
    'vocabularyAIGuidance',
    'deleted_vocabulary_pools',
    'vocabulary_pool_archives',
    'vocabulary_pool_deletion_challenges',
    'vocabulary_word_deletion_challenges',
    'content_sync_locks',
    'vocabulary_content_state',
  ];

  for (const collection of collections) {
    const reference = doc(db, collection, 'document-1');
    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { value: true }));
    await assertFails(deleteDoc(reference));
  }

  console.log(`Verified direct client denial for ${collections.length} server-only collections.`);

  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'vocabularyAIGuidance', 'global'), {
      revision: 1,
      rules: [{ id: 'approved', instruction: 'Preserve irregular forms.' }],
      updatedBy: 'admin-1',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
  });
  const contexts = [
    environment.unauthenticatedContext(),
    environment.authenticatedContext('student-1', { role: 'student' }),
    environment.authenticatedContext('teacher-1', { role: 'teacher' }),
    environment.authenticatedContext('admin-1', { role: 'admin' }),
  ];
  for (const context of contexts) {
    const client = context.firestore();
    const guidance = doc(client, 'vocabularyAIGuidance', 'global');
    await assertFails(getDoc(guidance));
    await assertFails(getDocs(collection(client, 'vocabularyAIGuidance')));
    await assertFails(setDoc(doc(client, 'vocabularyAIGuidance', 'injected'), { rules: [] }));
    await assertFails(updateDoc(guidance, { rules: [{ id: 'injected', instruction: 'Unapproved instruction.' }] }));
    await assertFails(deleteDoc(guidance));
    await assertFails(setDoc(doc(client, 'vocabularyAIGuidance', 'global', 'nested', 'injected'), { value: true }));
    await assertFails(getDoc(doc(client, 'vocabularyAIGuidance', 'global', 'nested', 'injected')));
  }
  console.log('Verified global AI guidance read/list/create/update/delete and nested denial for all client roles.');
} finally {
  await environment.cleanup();
}
