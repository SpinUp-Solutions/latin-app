import { GET, POST } from '@/src/app/api/admin/practice-categories/route';

const mockVerifyAdminAccess = jest.fn();
const mockListCategories = jest.fn();
const mockCreateCategory = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: jest.requireActual('@/src/lib/admin-access-error').AdminAccessError,
  verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
}));

jest.mock('@/src/lib/practice-categories/service', () => ({
  PracticeCategoryError: class PracticeCategoryError extends Error {},
  practiceCategoryService: {
    listCategories: (...args: unknown[]) => mockListCategories(...args),
    createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  },
}));

const request = (body?: unknown, search = '') =>
  ({
    nextUrl: { searchParams: new URLSearchParams(search) },
    json: async () => body,
  }) as never;

describe('practice category admin routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAdminAccess.mockResolvedValue({ uid: 'admin-1' });
    mockListCategories.mockResolvedValue([]);
  });

  it.each([
    ['Unauthorized', 401],
    ['Forbidden', 403],
  ] as const)('preserves %s authorization responses', async (message, status) => {
    const { AdminAccessError } = jest.requireMock('@/src/lib/verifyAdminAccess') as {
      AdminAccessError: new (message: 'Unauthorized' | 'Forbidden', status: 401 | 403) => Error;
    };
    mockVerifyAdminAccess.mockRejectedValue(new AdminAccessError(message, status));

    const response = (await GET(request(undefined, 'lessonType=vocab&status=active'))) as unknown as {
      status: number;
      body: unknown;
    };
    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: message });
    expect(mockListCategories).not.toHaveBeenCalled();
  });

  it('rejects invalid category creation before calling the service', async () => {
    const response = (await POST(request({ lessonType: 'normal', name: '' }))) as unknown as {
      status: number;
      body: { code: string };
    };
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it.each([
    ['', false],
    ['&includeCounts=true', true],
  ])('lists categories with counts only when requested (%s)', async (query, includeCounts) => {
    await GET(request(undefined, `lessonType=vocab&status=active${query}`));

    expect(mockListCategories).toHaveBeenCalledWith({ lessonType: 'vocab', status: 'active', includeCounts });
  });
});
