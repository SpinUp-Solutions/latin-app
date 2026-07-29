import {
  getCategoryCounts,
  parsePracticeCategoryContext,
} from '@/src/components/admin/practice-categories/category-admin-shared';
import { getApiErrorMessage, hasApiErrorStatus } from '@/src/store/api/baseQuery';
import type { PracticeCategoryWithCounts } from '@/src/types/practice-category';
import { haveSameIdOrder, orderByIds } from '@/src/utils/orderByIds';

const category: PracticeCategoryWithCounts = {
  id: 'authors',
  lessonType: 'vocab',
  name: 'Authors',
  normalizedName: 'authors',
  status: 'active',
  categoryOrder: 0,
  tags: [],
  createdAt: '2026-07-14T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-07-14T00:00:00.000Z',
  updatedBy: 'admin',
  assignedLessonCount: 5,
  liveLessonCount: 3,
  draftLessonCount: 2,
};

describe('practice category admin UI contracts', () => {
  it('reads valid URL-backed context and defaults invalid or missing values', () => {
    expect(parsePracticeCategoryContext('?lessonType=listening&status=archived')).toEqual({
      lessonType: 'listening',
      status: 'archived',
    });
    expect(parsePracticeCategoryContext('?lessonType=normal&status=deleted')).toEqual({
      lessonType: 'vocab',
      status: 'active',
    });
    expect(parsePracticeCategoryContext('')).toEqual({ lessonType: 'vocab', status: 'active' });
  });

  it('maps assigned, live, and draft counts without inferring publication state', () => {
    expect(getCategoryCounts(category)).toEqual({ assigned: 5, live: 3, draft: 2 });
  });

  it('applies a draft order without dropping newly loaded items', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    expect(orderByIds(items, ['b', 'a']).map(item => item.id)).toEqual(['b', 'a', 'c']);
    expect(haveSameIdOrder(['b', 'a'], ['b', 'a'])).toBe(true);
    expect(haveSameIdOrder(['b', 'a'], ['a', 'b'])).toBe(false);
  });

  it('reads RTK Query errors for inline conflict handling', () => {
    const error = {
      status: 409,
      data: { error: 'A Vocabulary category with this name already exists', code: 'CATEGORY_NAME_CONFLICT' },
    };

    expect(hasApiErrorStatus(error, 409)).toBe(true);
    expect(getApiErrorMessage(error, 'fallback')).toBe('A Vocabulary category with this name already exists');
  });
});
