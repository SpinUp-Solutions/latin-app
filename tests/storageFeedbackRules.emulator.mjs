import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = process.env.GCLOUD_PROJECT || 'demo-latin-app';
const [firestoreHost = '127.0.0.1', firestorePort = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
const [storageHost = '127.0.0.1', storagePort = '9199'] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '').split(':');
const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: firestoreHost,
    port: Number(firestorePort),
    rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
  storage: {
    host: storageHost,
    port: Number(storagePort),
    rules: await readFile(new URL('../storage.rules', import.meta.url), 'utf8'),
  },
});

const owner = 'student-1';
const sessionId = '11111111-1111-4111-8111-111111111111';
const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ownerStorage = environment.authenticatedContext(owner).storage('gs://demo-latin-app.appspot.com');
const otherStorage = environment.authenticatedContext('other-student').storage('gs://demo-latin-app.appspot.com');
const guestStorage = environment.unauthenticatedContext().storage('gs://demo-latin-app.appspot.com');

async function seed(id, status = 'reserved', size = image.byteLength, mime = 'image/png', expiresAtMs = Date.now() + 60_000) {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'studentFeedbackSessions', sessionId), {
      ownerUid: owner, status: 'open', expiresAtMs,
    });
    await setDoc(doc(db, 'studentFeedbackSessions', sessionId, 'attachments', id), {
      id, ownerUid: owner, sessionId, status, reservedBytes: size, contentType: mime,
    });
  });
}

function staging(id) {
  return `student-feedback/staging/${owner}/${sessionId}/${id}`;
}

try {
  await environment.clearFirestore();
  await environment.clearStorage();

  await seed('valid');
  await assertSucceeds(uploadBytes(ref(ownerStorage, staging('valid')), image, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(ownerStorage, staging('valid')), image, { contentType: 'image/png' }));
  await assertFails(getBytes(ref(ownerStorage, staging('valid'))));
  await assertFails(deleteObject(ref(ownerStorage, staging('valid'))));
  await assertFails(uploadBytes(ref(otherStorage, staging('valid')), image, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(guestStorage, staging('valid')), image, { contentType: 'image/png' }));

  await assertFails(uploadBytes(ref(ownerStorage, staging('missing')), image, { contentType: 'image/png' }));
  await seed('wrong-mime');
  await assertFails(uploadBytes(ref(ownerStorage, staging('wrong-mime')), image, { contentType: 'image/jpeg' }));
  await seed('wrong-bytes');
  await assertFails(uploadBytes(ref(ownerStorage, staging('wrong-bytes')), image.slice(0, 8), { contentType: 'image/png' }));
  await seed('cancelled', 'cancelled');
  await assertFails(uploadBytes(ref(ownerStorage, staging('cancelled')), image, { contentType: 'image/png' }));
  await seed('expired', 'reserved', image.byteLength, 'image/png', Date.now() - 60_000);
  await assertFails(uploadBytes(ref(ownerStorage, staging('expired')), image, { contentType: 'image/png' }));

  const canonical = `student-feedback/private/${sessionId}/valid`;
  await assertFails(uploadBytes(ref(ownerStorage, canonical), image, { contentType: 'image/png' }));
  await assertFails(getBytes(ref(ownerStorage, canonical)));
  await assertFails(getBytes(ref(otherStorage, canonical)));
  console.log('Verified feedback Storage owner-only create, exact reservation, expiry, overwrite, and private denial.');
} finally {
  await environment.cleanup();
}
