import { GET, PUT } from '@/src/app/api/admin/learning-path/route';

const mockVerifyAdminAccess = jest.fn();
const mockGetAdminView = jest.fn();
const mockSave = jest.fn();

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
    learningPathService: {
      getAdminView: (...args: unknown[]) => mockGetAdminView(...args),
      save: (...args: unknown[]) => mockSave(...args),
    },
  };
});

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
  });

  it.each([
    ['Unauthorized', 401],
    ['Forbidden', 403],
  ] as const)('preserves %s authorization failures', async (message, status) => {
    const { AdminAccessError } = jest.requireMock('@/src/lib/verifyAdminAccess') as {
      AdminAccessError: new (message: 'Unauthorized' | 'Forbidden', status: 401 | 403) => Error;
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
    const response = (await PUT(request({ unitIds: ['lesson-1'], legacyField: true }))) as unknown as {
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
