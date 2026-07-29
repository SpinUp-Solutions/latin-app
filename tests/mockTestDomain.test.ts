import { validateTestAssignmentGraph } from '@/src/lib/tests/domain';
import { MockTestService } from '@/src/lib/tests/mock-service';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));

const test = (id: string, versionId: string) => ({
  id,
  kind: 'test' as const,
  title: id,
  description: '',
  passingPercentage: null,
  rotationVersions: [{ versionId }],
});
const mock = (id: string, versionId: string, parent: { kind: 'test'; testId: string } | { kind: 'standalone' }) => ({
  id,
  versionId,
  parent,
  title: id,
  description: '',
  passingPercentage: null,
  status: 'active' as const,
  isLive: false,
  mockOrder: null,
});

describe('mock delivery ownership invariants', () => {
  it('uses a deterministic parent/version assignment identity, including reactivation retries', () => {
    expect(MockTestService.parentMockId('test-1', 'version-1')).toBe(
      MockTestService.parentMockId('test-1', 'version-1')
    );
    expect(MockTestService.parentMockId('test-1', 'version-1')).not.toBe(
      MockTestService.parentMockId('test-1', 'version-2')
    );
  });

  it('rejects all simultaneous active ownership conflicts', () => {
    const errors = validateTestAssignmentGraph({
      tests: [test('test-1', 'v1'), test('test-2', 'v1')],
      mocks: [
        mock('mock-1', 'v1', { kind: 'test', testId: 'missing-test' }),
        mock('mock-2', 'v1', { kind: 'standalone' }),
      ],
      versionIds: ['v1'],
    });
    expect(errors.join('\n')).toMatch(/more than one test container/);
    expect(errors.join('\n')).toMatch(/active mock while still in normal rotation/);
    expect(errors.join('\n')).toMatch(/more than one active mock/);
    expect(errors.join('\n')).toMatch(/missing parent test/);
  });

  it('rejects missing active mock versions but permits archived history outside active ownership', () => {
    const archived = { ...mock('mock-history', 'gone', { kind: 'standalone' }), status: 'archived' as const };
    expect(validateTestAssignmentGraph({ tests: [], mocks: [archived], versionIds: [] })).toEqual([]);
    expect(
      validateTestAssignmentGraph({
        tests: [],
        mocks: [mock('mock-live', 'gone', { kind: 'standalone' })],
        versionIds: [],
      }).join('\n')
    ).toMatch(/missing version/);
  });
});
