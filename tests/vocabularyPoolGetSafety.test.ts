import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('vocabulary pool GET safety', () => {
  it('reports dangling word IDs without mutating membership from a stale read', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/api/admin/vocabulary-pools/[poolId]/route.ts'), 'utf8');
    const getHandler = source.slice(
      source.indexOf('export async function GET'),
      source.indexOf('export async function PUT')
    );

    expect(getHandler).toContain('missingWordIds');
    expect(getHandler).not.toContain('.update(');
  });
});
