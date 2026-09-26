import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('student feedback storage boundaries', () => {
  const firestoreRules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const storageRules = readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8');

  it('denies direct client access to reports and activity and excludes them from the fallback', () => {
    expect(firestoreRules).toContain('match /studentFeedback/{document=**} {\n      allow read, write: if false;');
    expect(firestoreRules).toContain("collection != 'studentFeedback'");
  });

  it('lets students create, but never read or change, uploads in their own draft folder', () => {
    expect(storageRules).toContain('match /student-feedback/uploads/{uid}/{draftId}/{attachmentId} {');
    expect(storageRules).toContain('request.auth.uid == uid');
    expect(storageRules).toContain('allow read, update, delete: if false;');
    expect(storageRules).toContain('match /student-feedback/reports/{allPaths=**} {\n      allow read, write: if false;');
  });
});
