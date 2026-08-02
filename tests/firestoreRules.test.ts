import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Firestore server-only collection rules', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

  it('keeps retired Learning Path migration audit records inaccessible to clients', () => {
    expect(rules).toMatch(/match \/learningPathMigrations\/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
    expect(rules).toContain("collection != 'learningPathMigrations'");
  });
});
