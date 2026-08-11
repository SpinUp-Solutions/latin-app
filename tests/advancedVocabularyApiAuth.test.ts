import { readFileSync } from 'node:fs';

describe('advanced vocabulary API authorization boundaries', () => {
  const source = readFileSync('src/store/api/advancedVocabularyApi.ts', 'utf8');

  it('authenticates admin inventory calls and sends generated exercise calls to the student-safe route', () => {
    expect(source).toContain('baseQuery: createAuthenticatedBaseQuery()');
    expect(source).toContain('url: `/admin/words?${params.toString()}`');
    expect(source).toContain('fetchGeneratedWordPages');
    expect(source.match(/fetchGeneratedWordPages\(/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
