import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routes = [
  'src/app/api/admin/vocabulary-pools/route.ts',
  'src/app/api/admin/vocabulary-pools/backfill-search-tokens/route.ts',
  'src/app/api/admin/vocabulary-pools/usages/route.ts',
  'src/app/api/admin/vocabulary-pools/[poolId]/route.ts',
  'src/app/api/admin/vocabulary-pools/[poolId]/deletion-challenge/route.ts',
  'src/app/api/admin/vocabulary-pools/[poolId]/words/route.ts',
  'src/app/api/admin/vocabulary-pools/[poolId]/summary/route.ts',
  'src/app/api/admin/vocabulary-pools/[poolId]/pos-summary/route.ts',
  'src/app/api/admin/vocabulary-pools/[poolId]/paradigm-summary/route.ts',
  'src/app/api/admin/words/route.ts',
  'src/app/api/admin/words/[wordId]/route.ts',
  'src/app/api/admin/words/backup/route.ts',
  'src/app/api/admin/words/migrate/route.ts',
];

describe('admin vocabulary API authorization', () => {
  it.each(routes)('checks server-side admin access in every handler in %s', route => {
    const source = readFileSync(resolve(process.cwd(), route), 'utf8');
    const handlerCount = source.match(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g)?.length ?? 0;
    const authorizationCount = source.match(/verifyAdminAccess\(request\)/g)?.length ?? 0;

    expect(handlerCount).toBeGreaterThan(0);
    expect(authorizationCount).toBe(handlerCount);
  });
});
