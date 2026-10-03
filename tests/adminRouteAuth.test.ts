import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The one invariant a behaviour test cannot hold for routes that do not exist
// yet: every admin handler authorizes on the server before doing anything else.
const adminApi = 'src/app/api/admin';
const routes = (readdirSync(adminApi, { recursive: true }) as string[])
  .filter(file => file.endsWith('route.ts'))
  .map(file => join(adminApi, file))
  .sort();

describe('admin API authorization', () => {
  it('finds the admin routes', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it.each(routes)('checks server-side admin access in every handler in %s', route => {
    const source = readFileSync(route, 'utf8');
    const handlerCount = source.match(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g)?.length ?? 0;
    const authorizationCount = source.match(/await verifyAdminAccess\(\w+\)/g)?.length ?? 0;

    expect(handlerCount).toBeGreaterThan(0);
    expect(authorizationCount).toBe(handlerCount);
  });
});
