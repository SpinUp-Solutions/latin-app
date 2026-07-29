import { POST as CREATE_TAG } from '@/src/app/api/admin/practice-categories/[categoryId]/tags/route';
import {
  DELETE as DELETE_TAG,
  PATCH as UPDATE_TAG,
} from '@/src/app/api/admin/practice-categories/[categoryId]/tags/[tagId]/route';
import { POST as REORDER_TAGS } from '@/src/app/api/admin/practice-categories/[categoryId]/tags/reorder/route';
import { PUT as UPDATE_MEMBERSHIP_TAGS } from '@/src/app/api/admin/practice-categories/[categoryId]/lessons/[lessonId]/tags/route';

const mockCreateTag = jest.fn();
const mockUpdateTag = jest.fn();
const mockDeleteTag = jest.fn();
const mockReorderTags = jest.fn();
const mockReplaceMembershipTags = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: class AdminAccessError extends Error {},
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));

jest.mock('@/src/lib/practice-categories/service', () => ({
  PracticeCategoryError: class PracticeCategoryError extends Error {},
  practiceCategoryService: {
    createTag: (...args: unknown[]) => mockCreateTag(...args),
    updateTag: (...args: unknown[]) => mockUpdateTag(...args),
    deleteTag: (...args: unknown[]) => mockDeleteTag(...args),
    reorderTags: (...args: unknown[]) => mockReorderTags(...args),
    replaceMembershipTags: (...args: unknown[]) => mockReplaceMembershipTags(...args),
  },
}));

const request = (body: unknown) => ({ json: async () => body }) as never;
const categoryContext = { params: Promise.resolve({ categoryId: 'authors' }) };
const tagContext = { params: Promise.resolve({ categoryId: 'authors', tagId: 'cicero' }) };
const lessonContext = { params: Promise.resolve({ categoryId: 'authors', lessonId: 'lesson-1' }) };

describe('practice tag admin routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTag.mockResolvedValue({ id: 'cicero', name: 'Cicero' });
    mockUpdateTag.mockResolvedValue({ id: 'cicero', name: 'Cicero' });
    mockDeleteTag.mockResolvedValue(undefined);
    mockReorderTags.mockResolvedValue([]);
    mockReplaceMembershipTags.mockResolvedValue({ id: 'membership-1', tagIds: ['cicero'] });
  });

  it('creates and updates category-owned tags with the authenticated actor', async () => {
    const createResponse = (await CREATE_TAG(request({ name: ' Cicero ' }), categoryContext)) as unknown as {
      status: number;
    };
    expect(createResponse.status).toBe(201);
    expect(mockCreateTag).toHaveBeenCalledWith('authors', { name: 'Cicero' }, 'admin-1');

    await UPDATE_TAG(request({ status: 'archived' }), tagContext);
    expect(mockUpdateTag).toHaveBeenCalledWith('authors', 'cicero', { status: 'archived' }, 'admin-1');
  });

  it('replaces the complete membership tag set and preserves category scope in the path', async () => {
    await UPDATE_MEMBERSHIP_TAGS(request({ tagIds: ['cicero', 'virgil'] }), lessonContext);

    expect(mockReplaceMembershipTags).toHaveBeenCalledWith('authors', 'lesson-1', ['cicero', 'virgil'], 'admin-1');
  });

  it('rejects duplicate reorder IDs before calling the service', async () => {
    const response = (await REORDER_TAGS(
      request({ orderedTagIds: ['cicero', 'cicero'] }),
      categoryContext
    )) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(mockReorderTags).not.toHaveBeenCalled();
  });

  it('deletes a tag only through its category-owned service operation', async () => {
    await DELETE_TAG(request(undefined), tagContext);
    expect(mockDeleteTag).toHaveBeenCalledWith('authors', 'cicero', 'admin-1');
  });
});
