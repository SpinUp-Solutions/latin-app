import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Firestore server-only collection rules', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

  it('keeps retired Learning Path migration audit records inaccessible to clients', () => {
    expect(rules).toMatch(/match \/learningPathMigrations\/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
    expect(rules).toContain("collection != 'learningPathMigrations'");
  });

  it.each([
    'vocabulary_pools',
    'vocabulary_words_v5',
    'vocabulary_words_v4',
    'vocabulary_word_requests',
    'deleted_vocabulary_pools',
    'vocabulary_pool_archives',
    'vocabulary_pool_deletion_challenges',
    'vocabulary_word_deletion_challenges',
    'content_sync_locks',
    'vocabulary_content_state',
  ])('keeps %s inaccessible to direct clients', collection => {
    expect(rules).toMatch(
      new RegExp(
        `match /${collection.replaceAll('_', '\\_')}/\\{document=\\*\\*\\} \\{\\s*allow read, write: if false;\\s*\\}`
      )
    );
    expect(rules).toContain(`collection != '${collection}'`);
  });

  it('denies future versioned vocabulary word collections through the fallback rule', () => {
    expect(rules).toContain("!collection.matches('vocabulary_words_v[0-9]+')");
  });
});
