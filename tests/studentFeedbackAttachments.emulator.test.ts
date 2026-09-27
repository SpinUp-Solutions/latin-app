/**
 * @jest-environment node
 * @jest-environment-options {"customExportConditions": ["node", "node-addons"]}
 */
// Runs against the Storage emulator in `npm run test:storage-rules` and is skipped otherwise.
jest.mock('@/src/services/firebase-admin', () => ({ adminStorage: {} }));

import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { feedbackUploadPath } from '@/shared/student-feedback';
import { feedbackReportAttachmentPath, storeFeedbackAttachments } from '@/src/lib/student-feedback/attachments.server';

const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const bucketName = 'demo-latin-app.appspot.com';
const draftId = '5d1c4a4e-7a55-4c43-9b1e-3f4f2a6f8b10';
const attachmentId = '6e2d5b5f-8b66-4d54-8c2f-4a5a3b7a9c21';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

(emulatorHost ? it : it.skip)('does not let the student’s upload token download the private report copy', async () => {
  const storage = new Storage({ apiEndpoint: `http://${emulatorHost}`, projectId: 'demo-latin-app' });
  // The emulator only accepts admin requests that carry its owner credential.
  storage.interceptors.push({
    request(options: ReturnType<Storage['interceptors'][number]['request']>) {
      options.headers = { ...options.headers, Authorization: 'Bearer owner' };
      return options;
    },
  });
  const bucket = storage.bucket(bucketName);
  const token = randomUUID();
  const upload = feedbackUploadPath('student-1', draftId, attachmentId);
  const downloadUrl = (path: string) =>
    `http://${emulatorHost}/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  await bucket.file(upload).save(PNG, {
    resumable: false,
    contentType: 'image/png',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  expect((await fetch(downloadUrl(upload))).status).toBe(200);

  await storeFeedbackAttachments('student-1', draftId, [{ id: attachmentId, name: 'screen.png' }], bucket);

  expect((await fetch(downloadUrl(feedbackReportAttachmentPath(draftId, attachmentId)))).status).toBe(403);
});
