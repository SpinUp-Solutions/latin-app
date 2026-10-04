import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADMIN_API_DIRECTORY = 'src/app/api/admin';

const routes = (readdirSync(join(process.cwd(), ADMIN_API_DIRECTORY), { recursive: true }) as string[])
  .filter(file => file.endsWith('route.ts'))
  .map(file => join(ADMIN_API_DIRECTORY, file))
  .sort();

/** Its handler calls a function shared with the student route, which checks access and maps errors itself. */
const SHARED_HANDLER_ROUTE = join(ADMIN_API_DIRECTORY, 'exercises/generated-preview/route.ts');

const count = (source: string, pattern: RegExp) => source.match(pattern)?.length ?? 0;

describe('admin API route conventions', () => {
  it('finds the admin routes', () => {
    expect(routes.length).toBeGreaterThan(50);
    expect(routes).toContain(SHARED_HANDLER_ROUTE);
  });

  describe.each(routes.filter(route => route !== SHARED_HANDLER_ROUTE))('%s', route => {
    const source = readFileSync(join(process.cwd(), route), 'utf8');
    const handlerCount = count(source, /export async function (GET|POST|PUT|PATCH|DELETE)\(/g);

    it('checks server-side admin access in every handler', () => {
      expect(handlerCount).toBeGreaterThan(0);
      expect(count(source, /verifyAdminAccess\(request\)/g)).toBe(handlerCount);
    });

    it('maps the errors of every handler through routeErrorResponse', () => {
      expect(count(source, /return routeErrorResponse\(error, /g)).toBe(handlerCount);
      expect(source).not.toMatch(/error instanceof/);
    });
  });

  it('checks admin access and maps errors in the shared generated-exercise handler', () => {
    const source = readFileSync(join(process.cwd(), SHARED_HANDLER_ROUTE), 'utf8');
    expect(source).toContain('await verifyAdminAccess(request);');
    expect(source).toMatch(/return routeErrorResponse\(\s*error,/);
  });
});
