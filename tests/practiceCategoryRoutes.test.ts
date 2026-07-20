import { GET, POST } from '@/src/app/api/admin/practice-categories/route';
import { GET as GET_AVAILABLE_LESSONS } from '@/src/app/api/admin/practice-categories/[categoryId]/lessons/available/route';

const mockVerifyAdminAccess = jest.fn();
const mockListCategories = jest.fn();
const mockCreateCategory = jest.fn();
const mockGetAvailableCategoryLessons = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

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

jest.mock('@/src/lib/practice-categories/service', () => ({
  PracticeCategoryError: class PracticeCategoryError extends Error {},
  practiceCategoryService: {
    listCategories: (...args: unknown[]) => mockListCategories(...args),
    createCategory: (...args: unknown[]) => mockCreateCategory(...args),
    getAvailableCategoryLessons: (...args: unknown[]) => mockGetAvailableCategoryLessons(...args),
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
    mockGetAvailableCategoryLessons.mockResolvedValue([]);
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

  it('uses lightweight category lists unless counts are requested', async () => {
    await GET(request(undefined, 'lessonType=vocab&status=active'));

    expect(mockListCategories).toHaveBeenCalledWith({
      lessonType: 'vocab',
      status: 'active',
      includeCounts: false,
    });
  });

  it('includes category counts when explicitly requested', async () => {
    await GET(request(undefined, 'lessonType=vocab&status=active&includeCounts=true'));

    expect(mockListCategories).toHaveBeenCalledWith({
      lessonType: 'vocab',
      status: 'active',
      includeCounts: true,
    });
  });

  it('loads available lessons through the dedicated endpoint', async () => {
    await GET_AVAILABLE_LESSONS(request(), { params: Promise.resolve({ categoryId: 'category-1' }) });

    expect(mockGetAvailableCategoryLessons).toHaveBeenCalledWith('category-1');
  });
});
