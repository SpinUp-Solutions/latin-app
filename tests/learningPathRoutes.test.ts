import {
  GET,
  PUT,
} from '@/src/app/api/admin/learning-path/route';
import { POST as POST_MIGRATION } from '@/src/app/api/admin/learning-path/migration/route';

const mockVerifyAdminAccess = jest.fn();
const mockGetAdminView = jest.fn();
const mockSave = jest.fn();
const mockBuildMigrationManifest = jest.fn();
const mockApplyMigration = jest.fn();
const mockVerifyMigration = jest.fn();
const mockRollbackMigration = jest.fn();
const mockRetireMigration = jest.fn();
const mockGetNormalSequenceUnitIds = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => {
  class AdminAccessError extends Error {
    constructor(
      message: 'Unauthorized' | 'Forbidden',
      public readonly status: 401 | 403
    ) {
      super(message);
      this.name = 'AdminAccessError';
    }
  }
  return {
    AdminAccessError,
    verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
  };
});

jest.mock('@/src/lib/learning-units/learning-path-service', () => {
  const { LearningPathServiceError } = jest.requireActual(
    '@/src/lib/learning-units/learning-path-errors'
  ) as typeof import('@/src/lib/learning-units/learning-path-errors');
  return {
    LearningPathServiceError,
    assertLearningPathProjectionParity: (
      expected: string[],
      admin: string[],
      student: string[]
    ) => {
      if (
        JSON.stringify(expected) !== JSON.stringify(admin) ||
        JSON.stringify(expected) !== JSON.stringify(student)
      ) {
        throw new LearningPathServiceError(
          'VERIFICATION_FAILED',
          'Projection mismatch',
          409
        );
      }
    },
    learningPathService: {
      getAdminView: (...args: unknown[]) => mockGetAdminView(...args),
      save: (...args: unknown[]) => mockSave(...args),
      buildMigrationManifest: (...args: unknown[]) => mockBuildMigrationManifest(...args),
      applyMigration: (...args: unknown[]) => mockApplyMigration(...args),
      verifyMigration: (...args: unknown[]) => mockVerifyMigration(...args),
      rollbackMigration: (...args: unknown[]) => mockRollbackMigration(...args),
      retireMigration: (...args: unknown[]) => mockRetireMigration(...args),
    },
  };
});

jest.mock('@/src/lib/learning-units/student-dashboard-service', () => ({
  studentDashboardService: {
    getNormalSequenceUnitIds: (...args: unknown[]) =>
      mockGetNormalSequenceUnitIds(...args),
  },
}));

const request = (body?: unknown) =>
  ({
    json: async () => body,
  }) as never;

describe('Learning Path admin routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-1' });
    mockGetAdminView.mockResolvedValue({
      path: { revision: 1, unitIds: ['lesson-1'] },
      effectiveUnitIds: ['lesson-1'],
      source: 'learning-path',
      canEdit: false,
    });
    mockGetNormalSequenceUnitIds.mockResolvedValue(['lesson-1']);
  });

  it.each([
    ['Unauthorized', 401],
    ['Forbidden', 403],
  ] as const)('preserves %s authorization failures', async (message, status) => {
    const { AdminAccessError } = jest.requireMock('@/src/lib/verifyAdminAccess') as {
      AdminAccessError: new (
        message: 'Unauthorized' | 'Forbidden',
        status: 401 | 403
      ) => Error;
    };
    mockVerifyAdminAccess.mockRejectedValue(new AdminAccessError(message, status));

    const response = (await GET(request())) as unknown as {
      status: number;
      body: unknown;
    };

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: message });
    expect(mockGetAdminView).not.toHaveBeenCalled();
  });

  it('rejects malformed or partial saves before calling the service', async () => {
    const response = (await PUT(
      request({ unitIds: ['lesson-1'], cutover: { state: 'active' } })
    )) as unknown as {
      status: number;
      body: { code: string };
    };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('passes only the validated complete-sequence input and actor to the service', async () => {
    const input = {
      expectedRevision: 4,
      unitIds: ['lesson-2', 'lesson-1'],
    };
    mockSave.mockResolvedValue({
      id: 'default',
      revision: 5,
      unitIds: input.unitIds,
      updatedAt: 'now',
      updatedBy: 'admin-1',
    });

    const response = (await PUT(request(input))) as unknown as {
      status: number;
      body: { path: { revision: number } };
    };

    expect(response.status).toBe(200);
    expect(response.body.path.revision).toBe(5);
    expect(mockSave).toHaveBeenCalledWith(input, 'admin-1');
  });
});

describe('Learning Path migration route', () => {
  const manifest = {
    migrationId: 'migration-1',
    createdAt: 'now',
    sourceHash: 'a'.repeat(64),
    unitIds: ['lesson-1'],
    source: [{ unitId: 'lesson-1', liveOrder: 0 }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-1' });
    mockGetAdminView.mockResolvedValue({
      path: { revision: 1, unitIds: ['lesson-1'] },
      effectiveUnitIds: ['lesson-1'],
      source: 'learning-path',
      canEdit: false,
    });
    mockGetNormalSequenceUnitIds.mockResolvedValue(['lesson-1']);
  });

  it('preserves admin authorization failures', async () => {
    const { AdminAccessError } = jest.requireMock('@/src/lib/verifyAdminAccess') as {
      AdminAccessError: new (
        message: 'Unauthorized' | 'Forbidden',
        status: 401 | 403
      ) => Error;
    };
    mockVerifyAdminAccess.mockRejectedValue(new AdminAccessError('Forbidden', 403));

    const response = (await POST_MIGRATION(
      request({ action: 'rollback' })
    )) as unknown as { status: number; body: unknown };

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(mockRollbackMigration).not.toHaveBeenCalled();
  });

  it('rejects malformed commands before calling the service', async () => {
    const response = (await POST_MIGRATION(
      request({ action: 'apply', manifest: { migrationId: 'partial' } })
    )) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockApplyMigration).not.toHaveBeenCalled();
  });

  it('dispatches every validated lifecycle command with the correct actor boundary', async () => {
    mockBuildMigrationManifest.mockResolvedValue(manifest);
    mockApplyMigration.mockResolvedValue({ path: { revision: 1 }, applied: true });
    mockVerifyMigration.mockResolvedValue({ path: { revision: 1 }, verified: true });
    mockRollbackMigration.mockResolvedValue({ revision: 1 });
    mockRetireMigration.mockResolvedValue({ revision: 1 });

    const dryRun = (await POST_MIGRATION(
      request({ action: 'dry-run', migrationId: 'migration-1' })
    )) as unknown as { status: number; body: { manifest: unknown } };
    const apply = (await POST_MIGRATION(
      request({ action: 'apply', manifest })
    )) as unknown as { status: number };
    const verify = (await POST_MIGRATION(
      request({ action: 'verify', manifest })
    )) as unknown as { status: number };
    const rollback = (await POST_MIGRATION(
      request({ action: 'rollback' })
    )) as unknown as { status: number };
    const retire = (await POST_MIGRATION(
      request({ action: 'retire' })
    )) as unknown as { status: number };

    expect([dryRun.status, apply.status, verify.status, rollback.status, retire.status]).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect(dryRun.body.manifest).toEqual(manifest);
    expect(mockBuildMigrationManifest).toHaveBeenCalledWith('migration-1');
    expect(mockApplyMigration).toHaveBeenCalledWith(manifest, 'admin-1');
    expect(mockVerifyMigration).toHaveBeenCalledWith(manifest);
    expect(mockVerifyMigration).toHaveBeenCalledTimes(2);
    expect(mockRollbackMigration).toHaveBeenCalledWith('admin-1');
    expect(mockRetireMigration).toHaveBeenCalledWith('admin-1');
  });

  it('fails verification when either production projection diverges', async () => {
    mockVerifyMigration.mockResolvedValue({ path: { revision: 1 }, verified: true });
    mockGetNormalSequenceUnitIds.mockResolvedValue([]);

    const response = (await POST_MIGRATION(
      request({ action: 'verify', manifest })
    )) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VERIFICATION_FAILED');
    expect(mockVerifyMigration).toHaveBeenCalledTimes(1);
  });
});
