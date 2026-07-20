import { selectLeastUsedTestVersion } from '@/src/lib/tests/domain';

describe('normal-test version selection', () => {
  it('uses the least-used version across the complete submitted history', () => {
    expect(
      selectLeastUsedTestVersion(
        ['version-a', 'version-b', 'version-c'],
        [
          { versionId: 'version-a', submittedAt: '2026-01-01T00:00:00.000Z' },
          { versionId: 'version-a', submittedAt: '2026-01-02T00:00:00.000Z' },
          { versionId: 'version-b', submittedAt: '2026-01-03T00:00:00.000Z' },
        ],
        () => 0.99
      )
    ).toBe('version-c');
  });

  it('avoids the immediately previous version when least-used candidates are tied', () => {
    expect(
      selectLeastUsedTestVersion(
        ['version-a', 'version-b', 'version-c'],
        [
          { versionId: 'version-a', submittedAt: '2026-01-01T00:00:00.000Z' },
          { versionId: 'version-b', submittedAt: '2026-01-02T00:00:00.000Z' },
          { versionId: 'version-c', submittedAt: '2026-01-03T00:00:00.000Z' },
        ],
        () => 0.99
      )
    ).toBe('version-b');
  });

  it('does not count retired versions toward current rotation usage', () => {
    expect(
      selectLeastUsedTestVersion(
        ['version-a', 'version-b'],
        [
          { versionId: 'retired-version', submittedAt: '2026-01-03T00:00:00.000Z' },
          { versionId: 'version-a', submittedAt: '2026-01-02T00:00:00.000Z' },
        ],
        () => 0
      )
    ).toBe('version-b');
  });
});
