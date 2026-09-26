import { readFileSync } from 'node:fs';
import { normalizeAdvancedVocabularyCollection } from '@/src/store/api/advancedVocabularyApi';

describe('advanced vocabulary API authorization boundaries', () => {
  it('normalizes legacy inventory collections', () => {
    expect(normalizeAdvancedVocabularyCollection('vocabulary_words_v4')).toBe('vocabulary_words_v5');
  });

  const source = readFileSync('src/store/api/advancedVocabularyApi.ts', 'utf8');

  it('authenticates admin inventory calls and sends generated exercise calls to the student-safe route', () => {
    expect(source).toContain('baseQuery: createAuthenticatedBaseQuery()');
    expect(source).toContain('url: `/admin/words?${params.toString()}`');
    expect(source).toContain("url: '/admin/exercises/generated-preview'");
    expect(source).toContain("url: '/words/generated-exercise'");
  });
});
