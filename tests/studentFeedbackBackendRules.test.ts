import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('student feedback Firestore boundaries', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

  it.each(['studentFeedback', 'studentFeedbackSessions', 'studentFeedbackThrottles'])(
    'denies direct client access to %s including descendants and excludes the fallback',
    collection => {
      expect(rules).toContain(`match /${collection}/{document=**} {\n      allow read, write: if false;`);
      expect(rules).toContain(`collection != '${collection}'`);
    }
  );
});
