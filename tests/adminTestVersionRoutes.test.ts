import { POST as addVersion } from '@/src/app/api/admin/tests/[id]/versions/route';
import { POST as duplicateVersion } from '@/src/app/api/admin/tests/[id]/versions/[versionId]/duplicate/route';
import { PATCH as updateSettings } from '@/src/app/api/admin/tests/[id]/settings/route';

const verifyAdmin = jest.fn();
jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: (...args: unknown[]) => verifyAdmin(...args),
  AdminAccessError: class AdminAccessError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
}));
jest.mock('@/src/lib/tests/authoring-service', () => ({
  testAuthoringService: {
    addTestVersion: jest.fn(),
    duplicateTestVersion: jest.fn(),
    updateTest: jest.fn(),
  },
}));

const service = () =>
  jest.requireMock('@/src/lib/tests/authoring-service').testAuthoringService as Record<string, jest.Mock>;

const request = (body: unknown) => ({ json: async () => body }) as never;
const testContext = { params: Promise.resolve({ id: 'test-1' }) };
const versionContext = { params: Promise.resolve({ id: 'test-1', versionId: 'version-1' }) };
const version = {
  id: 'version-2',
  name: 'Version B',
  pages: [{ id: 'page-1', items: [{ id: 'q-1', type: 'multiple-choice', maxPoints: 1 }] }],
};

describe('admin normal-test version routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyAdmin.mockResolvedValue({ uid: 'admin-1' });
  });

  it('authenticates and delegates retry-stable add, duplicate, and zero-rotation settings writes', async () => {
    service().addTestVersion.mockResolvedValue({ test: {}, version: {} });
    service().duplicateTestVersion.mockResolvedValue({ test: {}, version: {} });
    service().updateTest.mockResolvedValue({});
    expect((await addVersion(request(version), testContext)).status).toBe(201);
    expect((await duplicateVersion(request({ requestId: 'retry-1', name: 'Copy' }), versionContext)).status).toBe(201);
    expect(
      (await updateSettings(request({ title: 'Empty but editable', passingPercentage: null }), testContext)).status
    ).toBe(200);
    expect(service().addTestVersion).toHaveBeenCalledWith('test-1', version, 'admin-1');
    expect(service().duplicateTestVersion).toHaveBeenCalledWith(
      'test-1',
      'version-1',
      { requestId: 'retry-1', name: 'Copy' },
      'admin-1'
    );
    expect(service().updateTest).toHaveBeenCalledWith(
      'test-1',
      { title: 'Empty but editable', passingPercentage: null },
      'admin-1'
    );
  });

  it('maps malformed IDs and payloads before service invocation', async () => {
    const badContext = { params: Promise.resolve({ id: 'bad/id', versionId: 'version-1' }) };
    expect((await duplicateVersion(request({ requestId: 'retry-1' }), badContext)).status).toBe(400);
    expect((await updateSettings(request({}), testContext)).status).toBe(400);
    expect(service().duplicateTestVersion).not.toHaveBeenCalled();
    expect(service().updateTest).not.toHaveBeenCalled();
  });

  it('maps admin authorization failures without invoking persistence', async () => {
    const { AdminAccessError } = jest.requireMock('@/src/lib/verifyAdminAccess');
    verifyAdmin.mockRejectedValueOnce(new AdminAccessError('Forbidden', 403));
    expect((await addVersion(request(version), testContext)).status).toBe(403);
    expect(service().addTestVersion).not.toHaveBeenCalled();
  });
});
