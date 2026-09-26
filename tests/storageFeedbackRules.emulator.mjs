import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const projectId = process.env.GCLOUD_PROJECT || 'demo-latin-app';
const [storageHost = '127.0.0.1', storagePort = '9199'] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '').split(':');
const environment = await initializeTestEnvironment({
  projectId,
  storage: {
    host: storageHost,
    port: Number(storagePort),
    rules: await readFile(new URL('../storage.rules', import.meta.url), 'utf8'),
  },
});

const bucket = 'gs://demo-latin-app.appspot.com';
const owner = 'student-1';
const draftId = '11111111-1111-4111-8111-111111111111';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ownerStorage = environment.authenticatedContext(owner, { firebase: { sign_in_provider: 'password' } }).storage(bucket);
const otherStorage = environment.authenticatedContext('student-2', { firebase: { sign_in_provider: 'password' } }).storage(bucket);
const anonymousStorage = environment.authenticatedContext(owner, { firebase: { sign_in_provider: 'anonymous' } }).storage(bucket);
const guestStorage = environment.unauthenticatedContext().storage(bucket);
const upload = id => `student-feedback/uploads/${owner}/${draftId}/${id}`;

try {
  await environment.clearStorage();

  await assertSucceeds(uploadBytes(ref(ownerStorage, upload('image')), png, { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(ref(ownerStorage, upload('video')), png, { contentType: 'video/quicktime' }));
  // Create-only: no overwrite, read-back or delete, even by the owner.
  await assertFails(uploadBytes(ref(ownerStorage, upload('image')), png, { contentType: 'image/png' }));
  await assertFails(getBytes(ref(ownerStorage, upload('image'))));
  await assertFails(deleteObject(ref(ownerStorage, upload('image'))));

  await assertFails(uploadBytes(ref(otherStorage, upload('other')), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(anonymousStorage, upload('anonymous')), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(guestStorage, upload('guest')), png, { contentType: 'image/png' }));
  await assertFails(uploadBytes(ref(ownerStorage, upload('html')), png, { contentType: 'text/html' }));
  await assertFails(uploadBytes(ref(ownerStorage, upload('svg')), png, { contentType: 'image/svg+xml' }));
  await assertFails(uploadBytes(ref(ownerStorage, upload('empty')), new Uint8Array(), { contentType: 'image/png' }));
  const elevenMegabytes = new Uint8Array(11 * 1024 * 1024);
  await assertFails(uploadBytes(ref(ownerStorage, upload('large')), elevenMegabytes, { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(ref(ownerStorage, upload('large-video')), elevenMegabytes, { contentType: 'video/mp4' }));

  const report = `student-feedback/reports/${draftId}/image`;
  await assertFails(uploadBytes(ref(ownerStorage, report), png, { contentType: 'image/png' }));
  await assertFails(getBytes(ref(ownerStorage, report)));
  console.log('Verified feedback uploads are owner-only, create-only, typed and size-limited, and report files are private.');
} finally {
  await environment.cleanup();
}
