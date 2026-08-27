import { readFileSync } from 'fs';
import { join } from 'path';

describe('dashboard learning-path carousel overflow', () => {
  it('keeps slides clipped while reserving enough paint space for the hover shadow', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/dashboard/page.tsx'), 'utf8');

    expect(source).toContain('!overflow-clip [overflow-clip-margin:4rem]');
    expect(source).toContain('className="min-w-0 overflow-visible');
  });
});
