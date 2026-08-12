import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('vocabulary cross-API cache invalidation', () => {
  it('invalidates student pool playback after word updates and deletes', () => {
    const vocabularyApiSource = readFileSync(join(process.cwd(), 'src/store/api/vocabularyApi.ts'), 'utf8');
    const studentTagInvalidations = vocabularyApiSource.match(/id: 'STUDENT_LIST'/g) ?? [];
    expect(studentTagInvalidations).toHaveLength(2);

    const poolApiSource = readFileSync(join(process.cwd(), 'src/store/api/vocabularyPoolApi.ts'), 'utf8');
    expect(poolApiSource).toContain("{ type: 'Pool', id: 'STUDENT_LIST' }");
  });
});
