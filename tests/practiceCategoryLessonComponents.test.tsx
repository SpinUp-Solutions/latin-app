import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PracticeCategoryChips } from '@/src/components/ui/admin/practice-categories/PracticeCategoryChips';
import { PracticeCategorySelector } from '@/src/components/ui/admin/practice-categories/PracticeCategorySelector';
import { CategoryFormDialog } from '@/src/components/admin/practice-categories/category-admin-shared';
import { AdminApiError } from '@/src/hooks/useAdminApi';
import type { PracticeCategory } from '@/src/types/practice-category';

const mockRefetch = jest.fn();
const mockActiveCategories: PracticeCategory[] = [];
const mockUseGetPracticeCategoriesQuery = jest.fn((_args?: unknown) => ({
  data: mockActiveCategories,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: mockRefetch,
}));

Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  value: class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  writable: true,
  value: jest.fn(),
});

jest.mock('@/src/store/api/practiceCategoryApi', () => ({
  useGetPracticeCategoriesQuery: (args: unknown) => mockUseGetPracticeCategoriesQuery(args),
}));

const makeCategory = (
  id: string,
  name: string,
  categoryOrder: number,
  status: PracticeCategory['status'] = 'active'
): PracticeCategory => ({
  id,
  lessonType: 'vocab',
  name,
  normalizedName: name.toLocaleLowerCase(),
  status,
  categoryOrder,
  createdAt: '2026-07-14T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-07-14T00:00:00.000Z',
  updatedBy: 'admin',
});

describe('practice category lesson controls', () => {
  beforeEach(() => {
    mockActiveCategories.splice(0, mockActiveCategories.length);
    mockRefetch.mockClear();
    mockUseGetPracticeCategoriesQuery.mockClear();
  });

  it('bounds informational chips and exposes all overflow category names accessibly', async () => {
    const categories = [
      makeCategory('authors', 'Authors', 0),
      makeCategory('old-topics', 'Old topics', 1, 'archived'),
      makeCategory('difficulty', 'Difficulty', 2),
      makeCategory('collections', 'Collections', 3),
    ];

    render(<PracticeCategoryChips categories={categories} maxVisible={3} />);

    expect(screen.getByText('Archived')).toBeInTheDocument();
    const overflow = screen.getByRole('button', {
      name: '1 more categories: Collections',
    });
    expect(overflow).toHaveTextContent('+1 more');

    await userEvent.click(overflow);
    expect(screen.getByText('All categories')).toBeInTheDocument();
    expect(screen.getByText('Collections')).toBeInTheDocument();
  });

  it('keeps an archived assignment visible and lets the admin explicitly remove it', async () => {
    const archived = makeCategory('old-topics', 'Old topics', 1, 'archived');
    const onChange = jest.fn();

    render(
      <PracticeCategorySelector
        lessonType="vocab"
        selectedIds={[archived.id]}
        assignedCategories={[archived]}
        onChange={onChange}
      />
    );

    expect(mockUseGetPracticeCategoriesQuery).toHaveBeenCalledWith({ lessonType: 'vocab', status: 'active' });
    expect(screen.getByRole('combobox', { name: 'Select practice categories' })).toHaveTextContent('Archived');
    expect(screen.getByText('1 category assigned')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Select practice categories' }));
    await userEvent.click(screen.getByRole('option', { name: 'Remove Old topics archived category' }));

    expect(onChange).toHaveBeenCalledWith([], []);
  });

  it('keeps category form values open and focuses the inline field error after a name conflict', async () => {
    const onOpenChange = jest.fn();
    const onSubmit = jest.fn().mockRejectedValue(
      new AdminApiError('A Vocabulary category with this name already exists', 409, {
        code: 'CATEGORY_NAME_CONFLICT',
      })
    );

    render(
      <CategoryFormDialog open onOpenChange={onOpenChange} mode="create" currentType="vocab" onSubmit={onSubmit} />
    );

    const name = screen.getByLabelText('Name');
    await userEvent.type(name, 'Authors');
    await userEvent.click(screen.getByRole('button', { name: 'Create category' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A Vocabulary category with this name already exists');
    expect(name).toHaveValue('Authors');
    await waitFor(() => expect(name).toHaveFocus());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('asks before discarding edited category form values', async () => {
    const onOpenChange = jest.fn();

    render(
      <CategoryFormDialog open onOpenChange={onOpenChange} mode="create" currentType="vocab" onSubmit={jest.fn()} />
    );

    await userEvent.type(screen.getByLabelText('Name'), 'Authors');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Discard unsaved category changes?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
