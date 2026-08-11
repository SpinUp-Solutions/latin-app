import { readFileSync } from 'node:fs';

describe('word migration transaction boundaries', () => {
  it('keeps global-revision migration transactions below 500 writes and serializes their revision updates', () => {
    const source = readFileSync('src/app/api/admin/words/migrate/route.ts', 'utf8');
    expect(source).toContain('const BATCH_SIZE = 400;');
    expect(source).toContain('await runVocabularyContentMutation(adminDb');
    expect(source).not.toContain('Promise.all(batches)');
  });
});
