import { GET as listMocks, PATCH as reorderMocks, POST as createMock } from '@/src/app/api/admin/mock-tests/route';
import { POST as assignMock } from '@/src/app/api/admin/mock-tests/assign/route';
import { GET as getMock, PATCH as updateMock } from '@/src/app/api/admin/mock-tests/[mockId]/route';
import { POST as archiveMock } from '@/src/app/api/admin/mock-tests/[mockId]/archive/route';
import { POST as reactivateMock } from '@/src/app/api/admin/mock-tests/[mockId]/reactivate/route';
import { POST as moveMock } from '@/src/app/api/admin/mock-tests/[mockId]/move-to-test/route';
import { POST as duplicateMock } from '@/src/app/api/admin/mock-tests/[mockId]/duplicate-into-test/route';
import { PATCH as updateMockVersion } from '@/src/app/api/admin/mock-tests/[mockId]/version/route';
import { GET as studentMockDetail } from '@/src/app/api/mock-tests/[mockId]/route';

const verifyAdmin = jest.fn();
const verifyStudent = jest.fn();
jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  verifyAdminAccess: (...args: unknown[]) => verifyAdmin(...args),
  AdminAccessError: class AdminAccessError extends Error {},
}));
jest.mock('@/src/lib/verifyRequestAuth', () => ({ verifyRequestAuth: (...args: unknown[]) => verifyStudent(...args) }));
jest.mock('@/src/lib/tests/mock-service', () => ({
  mockTestService: {
    listMocks: jest.fn(),
    createStandaloneMock: jest.fn(),
    reorderMocks: jest.fn(),
    assignVersionToMock: jest.fn(),
    getMock: jest.fn(),
    updateMock: jest.fn(),
    archiveMock: jest.fn(),
    moveStandaloneMockToTest: jest.fn(),
    reactivateStandaloneMock: jest.fn(),
    updateActiveMockVersion: jest.fn(),
    duplicateStandaloneMockVersionIntoTest: jest.fn(),
    listStudentLiveMocks: jest.fn(),
    getStudentMockDetail: jest.fn(),
  },
}));

const mockService = () => jest.requireMock('@/src/lib/tests/mock-service').mockTestService as Record<string, jest.Mock>;

const request = (body?: unknown) => ({ json: async () => body }) as never;
const context = (mockId = 'mock-1') => ({ params: Promise.resolve({ mockId }) });
const validMock = {
  mock: { id: 'mock-1', title: 'Mock', description: '', passingPercentage: null, isLive: false },
  version: {
    id: 'version-1',
    name: 'A',
    pages: [{ id: 'page-1', items: [{ id: 'question-1', type: 'multiple-choice', maxPoints: 1 }] }],
  },
};

describe('mock-test routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyAdmin.mockResolvedValue({ uid: 'admin-1' });
    verifyStudent.mockResolvedValue({ uid: 'student-1' });
  });

  it('keeps the admin list behind its auth check', async () => {
    mockService().listMocks.mockResolvedValue([]);
    expect((await listMocks(request())).status).toBe(200);
    expect(mockService().listMocks).toHaveBeenCalled();
  });

  it('validates and delegates the authenticated student mock-origin detail projection', async () => {
    mockService().getStudentMockDetail.mockResolvedValue({ mock: { id: 'mock-1' }, attempt: null });
    expect((await studentMockDetail(request(), context())).status).toBe(200);
    expect(mockService().getStudentMockDetail).toHaveBeenCalledWith('mock-1', 'student-1');
    expect((await studentMockDetail(request(), context('bad/id'))).status).toBe(400);
    verifyStudent.mockResolvedValueOnce(null);
    expect((await studentMockDetail(request(), context())).status).toBe(401);
  });

  it('rejects malformed JSON/domain inputs before every admin mutation reaches the service', async () => {
    const cases: Array<[string, () => Promise<{ status: number }>]> = [
      ['create', () => createMock(request({})) as never],
      ['reorder', () => reorderMocks(request({})) as never],
      ['assign', () => assignMock(request({})) as never],
      ['update', () => updateMock(request({}), context()) as never],
      ['move', () => moveMock(request({}), context()) as never],
      ['duplicate', () => duplicateMock(request({}), context()) as never],
      ['reactivate', () => reactivateMock(request({}), context()) as never],
      ['version', () => updateMockVersion(request({}), context()) as never],
    ];
    for (const [_name, invoke] of cases) expect((await invoke()).status).toBe(400);
    expect(mockService().createStandaloneMock).not.toHaveBeenCalled();
    expect(mockService().reorderMocks).not.toHaveBeenCalled();
    expect(mockService().assignVersionToMock).not.toHaveBeenCalled();
    expect(mockService().updateMock).not.toHaveBeenCalled();
    expect(mockService().moveStandaloneMockToTest).not.toHaveBeenCalled();
    expect(mockService().duplicateStandaloneMockVersionIntoTest).not.toHaveBeenCalled();
    expect(mockService().reactivateStandaloneMock).not.toHaveBeenCalled();
    expect(mockService().updateActiveMockVersion).not.toHaveBeenCalled();
  });

  it('validates and delegates mock-scoped version edits', async () => {
    mockService().updateActiveMockVersion.mockResolvedValue({ id: 'version-1' });
    const changes = { name: 'Updated', pages: validMock.version.pages };
    const response = await updateMockVersion(request(changes), context());
    expect(response.status).toBe(200);
    expect(mockService().updateActiveMockVersion).toHaveBeenCalledWith('mock-1', changes, 'admin-1');
    expect((await updateMockVersion(request(changes), context('bad/id'))).status).toBe(400);
    expect(
      (
        await updateMockVersion(
          {
            json: async () => {
              throw new Error('bad json');
            },
          } as never,
          context()
        )
      ).status
    ).toBe(400);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    verifyAdmin.mockRejectedValueOnce(new Error('denied'));
    expect((await updateMockVersion(request(changes), context())).status).toBe(500);
    errors.mockRestore();
    expect(mockService().updateActiveMockVersion).toHaveBeenCalledTimes(1);
  });

  it('passes stable duplicate retry keys without accepting client target ids', async () => {
    mockService().duplicateStandaloneMockVersionIntoTest.mockResolvedValue({});
    const body = { testId: 'test-1', requestId: 'retry-1' };
    expect((await duplicateMock(request(body), context())).status).toBe(200);
    expect(mockService().duplicateStandaloneMockVersionIntoTest).toHaveBeenCalledWith('mock-1', body, 'admin-1');
    expect((await duplicateMock(request({ ...body, versionId: 'client-id' }), context())).status).toBe(400);
  });

  it('delegates validated mutations with the authenticated admin identity', async () => {
    mockService().createStandaloneMock.mockResolvedValue({});
    mockService().assignVersionToMock.mockResolvedValue({});
    mockService().archiveMock.mockResolvedValue({});
    mockService().reactivateStandaloneMock.mockResolvedValue({});
    await createMock(request(validMock));
    await assignMock(
      request({
        testId: 'test-1',
        versionId: 'version-1',
        title: 'Mock',
        description: '',
        passingPercentage: null,
        isLive: false,
      })
    );
    await archiveMock(request(), context());
    await reactivateMock(request({ isLive: false }), context());
    expect(mockService().createStandaloneMock).toHaveBeenCalledWith(validMock, 'admin-1');
    expect(mockService().assignVersionToMock).toHaveBeenCalledWith(
      expect.objectContaining({ testId: 'test-1' }),
      'admin-1'
    );
    expect(mockService().archiveMock).toHaveBeenCalledWith('mock-1', 'admin-1');
    expect(mockService().reactivateStandaloneMock).toHaveBeenCalledWith('mock-1', { isLive: false }, 'admin-1');
  });

  it('validates ids before reading or mutating a detail route', async () => {
    expect((await getMock(request(), context('bad/id'))).status).toBe(400);
    expect((await archiveMock(request(), context('bad/id'))).status).toBe(400);
    expect((await reactivateMock(request({ isLive: false }), context('bad/id'))).status).toBe(400);
    expect(mockService().getMock).not.toHaveBeenCalled();
    expect(mockService().archiveMock).not.toHaveBeenCalled();
    expect(mockService().reactivateStandaloneMock).not.toHaveBeenCalled();
  });
});
