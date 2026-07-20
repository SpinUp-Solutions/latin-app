import { POST } from '@/src/app/api/admin/tests/route';

const mockVerifyAdminAccess = jest.fn();
const mockCreateTestWithVersion = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));

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

jest.mock('@/src/lib/tests/service', () => ({
  TestServiceError: class TestServiceError extends Error {},
  testService: {
    createTestWithVersion: (...args: unknown[]) => mockCreateTestWithVersion(...args),
  },
}));

const request = (body: unknown) => ({ json: async () => body }) as never;

describe('admin test routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-1' });
  });

  it('rejects malformed atomic creation input before calling the service', async () => {
    const response = (await POST(request({ test: { title: '' } }))) as unknown as {
      status: number;
      body: { code: string };
    };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockCreateTestWithVersion).not.toHaveBeenCalled();
  });

  it('passes the validated container and first version to the service', async () => {
    const input = {
      test: {
        id: 'test-1',
        title: 'Chapter test',
        description: '',
        passingPercentage: null,
      },
      version: {
        id: 'version-1',
        name: 'Version A',
        pages: [{ id: 'page-1', items: [{ id: 'question-1', type: 'multiple-choice', maxPoints: 2 }] }],
      },
    };
    mockCreateTestWithVersion.mockResolvedValue({ test: { id: 'test-1' }, version: { id: 'version-1' } });

    const response = (await POST(request(input))) as unknown as { status: number };

    expect(response.status).toBe(201);
    expect(mockCreateTestWithVersion).toHaveBeenCalledWith(input, 'admin-1');
  });
});
