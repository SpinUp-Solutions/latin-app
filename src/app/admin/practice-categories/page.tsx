'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import {
  CategoryFormDialog,
  CategoryFormSubmission,
  ConfirmActionDialog,
  getCategoryCounts,
  InlineLoadError,
  LoadingRows,
  PRACTICE_LESSON_TYPES,
  parsePracticeCategoryContext,
  practiceLessonTypeLabel,
  useBrowserNavigationProtection,
} from '@/src/components/admin/practice-categories/category-admin-shared';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/src/components/ui/dropdown-menu';
import { Input } from '@/src/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { getApiErrorMessage, hasApiErrorStatus } from '@/src/store/api/baseQuery';
import {
  practiceCategoryApi,
  useCreatePracticeCategoryMutation,
  useDeletePracticeCategoryMutation,
  useGetPracticeCategoriesWithCountsQuery,
  useReorderPracticeCategoriesMutation,
  useUpdatePracticeCategoryMutation,
} from '@/src/store/api/practiceCategoryApi';
import { useAppDispatch } from '@/src/store/hooks';
import type {
  PracticeCategoryStatus,
  PracticeCategoryWithCounts,
  PracticeLessonType,
} from '@/src/types/practice-category';
import { haveSameIdOrder, orderByIds } from '@/src/utils/orderByIds';

type CategoryAction = 'archive' | 'restore' | 'delete';

interface PendingContextNavigation {
  kind: 'context';
  lessonType: PracticeLessonType;
  status: PracticeCategoryStatus;
}

interface PendingHrefNavigation {
  kind: 'href';
  href: string;
}

type PendingNavigation = PendingContextNavigation | PendingHrefNavigation;

const EMPTY_CATEGORIES: PracticeCategoryWithCounts[] = [];

const orderedIds = (categories: PracticeCategoryWithCounts[]) => categories.map(category => category.id);

interface SortableCategoryRowProps {
  category: PracticeCategoryWithCounts;
  position: number;
  total: number;
  orderingEnabled: boolean;
  actionsDisabled: boolean;
  onOpen: () => void;
  onPrefetch: () => void;
  onEdit: () => void;
  onAction: (action: CategoryAction) => void;
  onMove: (offset: -1 | 1) => void;
}

function SortableCategoryRow({
  category,
  position,
  total,
  orderingEnabled,
  actionsDisabled,
  onOpen,
  onPrefetch,
  onEdit,
  onAction,
  onMove,
}: SortableCategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: !orderingEnabled,
  });
  const counts = getCategoryCounts(category);

  return (
    <div
      ref={setNodeRef}
      id={`practice-category-row-${category.id}`}
      tabIndex={-1}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.75 : 1,
      }}
      className="group flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="touch-none rounded-md p-2 text-gray-400 hover:bg-muted hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!orderingEnabled}
          aria-label={`Reorder ${category.name}, position ${position} of ${total}`}
          title={orderingEnabled ? `Drag to reorder ${category.name}` : 'Ordering is unavailable in this view'}
          {...attributes}
          {...listeners}>
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>
        {orderingEnabled && (
          <div className="hidden flex-col sm:flex">
            <button
              type="button"
              className="rounded p-0.5 text-gray-400 hover:bg-muted hover:text-gray-700 disabled:opacity-25"
              disabled={position === 1}
              onClick={() => onMove(-1)}
              aria-label={`Move ${category.name} up`}>
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-gray-400 hover:bg-muted hover:text-gray-700 disabled:opacity-25"
              disabled={position === total}
              onClick={() => onMove(1)}
              aria-label={`Move ${category.name} down`}>
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        onPointerEnter={onPrefetch}
        onFocus={onPrefetch}
        className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-serif text-lg font-semibold text-gray-900 group-hover:text-roman-red">{category.name}</h2>
          <Badge variant={category.status === 'active' ? 'secondary' : 'outline'}>
            {category.status === 'active' ? 'Active' : 'Archived'}
          </Badge>
        </div>
        {category.description && <p className="mt-1 line-clamp-2 text-sm text-roman-stone">{category.description}</p>}
        <div
          className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600"
          aria-label={`${counts.assigned} assigned lessons, ${counts.live} live, ${counts.draft} draft`}>
          <span>
            <strong className="font-medium text-gray-800">{counts.assigned}</strong> assigned
          </span>
          <span>
            <strong className="font-medium text-gray-800">{counts.live}</strong> live
          </span>
          <span>
            <strong className="font-medium text-gray-800">{counts.draft}</strong> draft
          </span>
        </div>
        {category.status === 'archived' && counts.assigned > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Remove all assigned lessons before permanently deleting this category.
          </p>
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={actionsDisabled}
            aria-label={`Actions for ${category.name}`}>
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {category.status === 'active' ? (
            <>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('archive')}>
                <Archive className="mr-2 h-4 w-4" aria-hidden="true" /> Archive
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => onAction('restore')}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Restore
              </DropdownMenuItem>
              {counts.assigned === 0 && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onAction('delete')}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Delete permanently
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function PracticeCategoriesPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [urlReady, setUrlReady] = useState(false);
  const [lessonType, setLessonType] = useState<PracticeLessonType>('vocab');
  const [status, setStatus] = useState<PracticeCategoryStatus>('active');
  const [categoryOrder, setCategoryOrder] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PracticeCategoryWithCounts | null>(null);
  const [action, setAction] = useState<{ kind: CategoryAction; category: PracticeCategoryWithCounts } | null>(null);
  const [discardNavigationOpen, setDiscardNavigationOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const focusAfterLoad = useRef<{ id?: string; name?: string; lessonType: PracticeLessonType } | null>(null);
  const {
    currentData: cachedCategories,
    isLoading: categoriesQueryLoading,
    isFetching: categoriesQueryFetching,
    error: categoriesQueryError,
    refetch: refetchCategories,
  } = useGetPracticeCategoriesWithCountsQuery({ lessonType, status }, { skip: !urlReady });
  const [createCategory] = useCreatePracticeCategoryMutation();
  const [updateCategory, { isLoading: updatePending }] = useUpdatePracticeCategoryMutation();
  const [deleteCategory, { isLoading: deletePending }] = useDeletePracticeCategoryMutation();
  const [reorderCategories, { isLoading: orderPending }] = useReorderPracticeCategoriesMutation();
  const loading = !urlReady || (categoriesQueryLoading && !cachedCategories);
  const serverCategories = cachedCategories ?? EMPTY_CATEGORIES;
  const categories = useMemo(
    () => (categoryOrder ? orderByIds(serverCategories, categoryOrder) : serverCategories),
    [categoryOrder, serverCategories]
  );
  const dirty = categoryOrder !== null && !haveSameIdOrder(orderedIds(categories), orderedIds(serverCategories));
  const loadError = categoriesQueryError
    ? getApiErrorMessage(categoriesQueryError, 'Unable to load practice categories')
    : null;
  const actionPending = updatePending || deletePending;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useBrowserNavigationProtection(dirty, 'category order changes');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const { lessonType: nextType, status: nextStatus } = parsePracticeCategoryContext(window.location.search);
    setLessonType(nextType);
    setStatus(nextStatus);
    params.set('lessonType', nextType);
    params.set('status', nextStatus);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
    setUrlReady(true);
  }, []);

  const setUrlContext = useCallback((nextType: PracticeLessonType, nextStatus: PracticeCategoryStatus) => {
    const params = new URLSearchParams(window.location.search);
    params.set('lessonType', nextType);
    params.set('status', nextStatus);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  useEffect(() => {
    const target = focusAfterLoad.current;
    if (!target || target.lessonType !== lessonType || loading || formOpen) return;
    const category = target.id
      ? categories.find(item => item.id === target.id)
      : categories.find(item => item.name.toLocaleLowerCase() === target.name?.toLocaleLowerCase());
    if (!category) return;
    requestAnimationFrame(() => document.getElementById(`practice-category-row-${category.id}`)?.focus());
    focusAfterLoad.current = null;
  }, [categories, formOpen, lessonType, loading]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return categories;
    return categories.filter(category =>
      `${category.name}\n${category.description ?? ''}`.toLocaleLowerCase().includes(query)
    );
  }, [categories, search]);

  const orderingEnabled = status === 'active' && !search.trim() && !orderPending;

  const applyContext = (nextType: PracticeLessonType, nextStatus: PracticeCategoryStatus) => {
    setSearch('');
    setCategoryOrder(null);
    setLessonType(nextType);
    setStatus(nextStatus);
    setUrlContext(nextType, nextStatus);
  };

  const guardContextChange = (nextType: PracticeLessonType, nextStatus: PracticeCategoryStatus) => {
    if (orderPending) return;
    if (nextType === lessonType && nextStatus === status) return;
    if (dirty) {
      setPendingNavigation({ kind: 'context', lessonType: nextType, status: nextStatus });
      setDiscardNavigationOpen(true);
      return;
    }
    applyContext(nextType, nextStatus);
  };

  const guardHref = (href: string) => {
    if (orderPending) return;
    if (dirty) {
      setPendingNavigation({ kind: 'href', href });
      setDiscardNavigationOpen(true);
      return;
    }
    router.push(href);
  };

  const focusListHeading = () => {
    requestAnimationFrame(() => document.getElementById('category-list-heading')?.focus());
  };

  const continuePendingNavigation = () => {
    const destination = pendingNavigation;
    setCategoryOrder(null);
    setDiscardNavigationOpen(false);
    setPendingNavigation(null);
    if (!destination) return;
    if (destination.kind === 'context') {
      applyContext(destination.lessonType, destination.status);
    } else {
      router.push(destination.href);
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !orderingEnabled) return;
    const from = categories.findIndex(category => category.id === active.id);
    const to = categories.findIndex(category => category.id === over.id);
    if (from >= 0 && to >= 0) setCategoryOrder(orderedIds(arrayMove(categories, from, to)));
  };

  const moveCategory = (categoryId: string, offset: -1 | 1) => {
    const from = categories.findIndex(category => category.id === categoryId);
    const to = from + offset;
    if (from >= 0 && to >= 0 && to < categories.length) {
      setCategoryOrder(orderedIds(arrayMove(categories, from, to)));
    }
  };

  const saveOrder = async (desiredIds = orderedIds(categories)) => {
    try {
      await reorderCategories({ lessonType, orderedCategoryIds: desiredIds }).unwrap();
      setCategoryOrder(null);
      toast.success('Category order saved');
    } catch (error) {
      setCategoryOrder(null);
      if (hasApiErrorStatus(error, 409)) {
        void refetchCategories();
        toast.error('The category list changed elsewhere. The latest order has been loaded.');
      } else {
        toast.error(getApiErrorMessage(error, 'Unable to save category order'), {
          action: {
            label: 'Retry',
            onClick: () => void saveOrder(desiredIds),
          },
        });
      }
    }
  };

  const submitCategory = async (submission: CategoryFormSubmission) => {
    if (editingCategory) {
      const { category: saved } = await updateCategory({
        categoryId: editingCategory.id,
        changes: { name: submission.name, description: submission.description },
      }).unwrap();
      focusAfterLoad.current = { id: saved.id, lessonType: editingCategory.lessonType };
      setSearch('');
      toast.success('Category updated');
      return;
    }

    const { category: created } = await createCategory(submission).unwrap();
    focusAfterLoad.current = {
      id: created.id,
      name: created.name,
      lessonType: submission.lessonType,
    };
    toast.success('Category created');
    if (submission.lessonType !== lessonType || status !== 'active') {
      applyContext(submission.lessonType, 'active');
    } else {
      setSearch('');
    }
  };

  const confirmCategoryAction = async () => {
    if (!action) return;
    try {
      if (action.kind === 'delete') {
        await deleteCategory(action.category.id).unwrap();
        toast.success('Category permanently deleted');
      } else {
        const nextStatus = action.kind === 'archive' ? 'archived' : 'active';
        await updateCategory({ categoryId: action.category.id, changes: { status: nextStatus } }).unwrap();
        toast.success(action.kind === 'archive' ? 'Category archived' : 'Category restored');
      }
      setAction(null);
      focusListHeading();
    } catch (error) {
      if (hasApiErrorStatus(error, 409)) {
        setAction(null);
        void refetchCategories();
        focusListHeading();
        toast.error('The category list changed elsewhere. The latest state has been loaded.');
      } else {
        toast.error(getApiErrorMessage(error, 'Unable to update the category'));
      }
    }
  };

  const actionDescription = (() => {
    if (!action) return '';
    const counts = getCategoryCounts(action.category);
    if (action.kind === 'archive') {
      return (
        <>
          <p>
            <strong>{action.category.name}</strong> currently has {counts.assigned} assigned{' '}
            {counts.assigned === 1 ? 'lesson' : 'lessons'}.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Lessons will not be deleted or unpublished.</li>
            <li>Existing assignments and their order will be retained.</li>
            <li>The category will no longer be offered for new assignments until restored.</li>
          </ul>
        </>
      );
    }
    if (action.kind === 'restore') {
      return (
        <p>
          <strong>{action.category.name}</strong> will return to Active at the end of the{' '}
          {practiceLessonTypeLabel(action.category.lessonType)} category order. Its lesson assignments and lesson order
          will be preserved.
        </p>
      );
    }
    return (
      <p>
        Permanently delete <strong>{action.category.name}</strong>? This operation cannot be undone. No lessons will be
        deleted.
      </p>
    );
  })();

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="border-b bg-white">
        <div className="container mx-auto flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              type="button"
              variant="ghost"
              className="shrink-0"
              disabled={orderPending}
              onClick={() => guardHref('/admin')}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back to Admin
            </Button>
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-roman-red text-white md:flex">
              <Tags className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-serif text-2xl tracking-wide text-gray-900">Manage Practice Categories</h1>
              <p className="mt-1 max-w-2xl text-sm text-roman-stone">
                Create type-specific tags for practice lessons. One lesson may have several tags.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0 bg-roman-red hover:bg-roman-red/90"
            disabled={dirty || loading}
            title={dirty ? 'Save or discard order changes first' : undefined}
            onClick={() => {
              setEditingCategory(null);
              setFormOpen(true);
            }}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Create category
          </Button>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-8">
        <Tabs value={lessonType} onValueChange={value => guardContextChange(value as PracticeLessonType, status)}>
          <TabsList className="grid h-auto w-full grid-cols-3">
            {PRACTICE_LESSON_TYPES.map(option => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                className="whitespace-normal py-2 text-center"
                disabled={orderPending}>
                <span className="hidden sm:inline">{option.label}</span>
                <span className="sm:hidden">{option.shortLabel}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <section className="rounded-xl border bg-white/70 p-4 shadow-sm sm:p-6" aria-labelledby="category-list-heading">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2
                id="category-list-heading"
                className="font-serif text-xl text-gray-900"
                data-dialog-focus-fallback
                tabIndex={-1}>
                {practiceLessonTypeLabel(lessonType)} categories
              </h2>
              <div className="mt-3 inline-flex rounded-md bg-muted p-1" role="group" aria-label="Category status">
                {(['active', 'archived'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={status === option}
                    disabled={orderPending}
                    onClick={() => guardContextChange(lessonType, option)}
                    className={`rounded px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                      status === option
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-muted-foreground hover:text-gray-900'
                    }`}>
                    {option === 'active' ? 'Active' : 'Archived'}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full max-w-md">
              <label htmlFor="category-search" className="mb-1.5 block text-sm font-medium text-gray-700">
                Search categories
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <Input
                  id="category-search"
                  className="bg-white pl-9 pr-9"
                  value={search}
                  disabled={dirty}
                  placeholder="Search name or description"
                  onChange={event => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setSearch('')}
                    aria-label="Clear category search">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm text-roman-stone">
            <p aria-live="polite">
              {filteredCategories.length} matching {filteredCategories.length === 1 ? 'category' : 'categories'}
            </p>
            {categoriesQueryFetching && !loading && <p>Refreshing categories…</p>}
            {status === 'active' && search.trim() && <p>Clear search to reorder the complete category list.</p>}
            {dirty && <p className="font-medium text-amber-700">Category order has unsaved changes.</p>}
          </div>

          <div className="mt-4">
            {loading ? (
              <LoadingRows />
            ) : loadError ? (
              <InlineLoadError message={loadError} onRetry={() => void refetchCategories()} />
            ) : filteredCategories.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-white px-6 py-12 text-center">
                {search.trim() ? (
                  <>
                    <h3 className="font-serif text-lg text-gray-900">No categories match your search</h3>
                    <p className="mt-2 text-sm text-roman-stone">Try another name or description.</p>
                    <Button type="button" variant="outline" className="mt-5" onClick={() => setSearch('')}>
                      Clear search
                    </Button>
                  </>
                ) : status === 'active' ? (
                  <>
                    <h3 className="font-serif text-lg text-gray-900">
                      No active {practiceLessonTypeLabel(lessonType)} categories
                    </h3>
                    <p className="mt-2 text-sm text-roman-stone">Create the first category for this lesson type.</p>
                    <Button
                      type="button"
                      className="mt-5"
                      onClick={() => {
                        setEditingCategory(null);
                        setFormOpen(true);
                      }}>
                      <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Create category
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="font-serif text-lg text-gray-900">No archived categories</h3>
                    <p className="mt-2 text-sm text-roman-stone">
                      Archived categories for this lesson type will appear here.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                onDragEnd={handleDragEnd}
                accessibility={{
                  announcements: {
                    onDragStart: ({ active }) => {
                      const category = categories.find(item => item.id === active.id);
                      return category ? `Picked up ${category.name}` : 'Picked up category';
                    },
                    onDragOver: ({ active, over }) => {
                      const category = categories.find(item => item.id === active.id);
                      const nextPosition = over ? categories.findIndex(item => item.id === over.id) + 1 : 0;
                      return category && nextPosition
                        ? `${category.name} is over position ${nextPosition}`
                        : 'Category is no longer over a valid position';
                    },
                    onDragEnd: ({ active, over }) => {
                      const category = categories.find(item => item.id === active.id);
                      const nextPosition = over ? categories.findIndex(item => item.id === over.id) + 1 : 0;
                      return category && nextPosition
                        ? `${category.name} moved to position ${nextPosition}`
                        : 'Category movement ended';
                    },
                    onDragCancel: ({ active }) => {
                      const category = categories.find(item => item.id === active.id);
                      return category ? `Movement cancelled for ${category.name}` : 'Category movement cancelled';
                    },
                  },
                }}>
                <SortableContext
                  items={filteredCategories.map(category => category.id)}
                  strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {filteredCategories.map(category => {
                      const position = categories.findIndex(item => item.id === category.id) + 1;
                      const href = `/admin/practice-categories/${category.id}?lessonType=${lessonType}&status=${status}`;
                      return (
                        <SortableCategoryRow
                          key={category.id}
                          category={category}
                          position={position}
                          total={categories.length}
                          orderingEnabled={orderingEnabled}
                          actionsDisabled={dirty || orderPending}
                          onOpen={() => guardHref(href)}
                          onPrefetch={() => {
                            router.prefetch(href);
                            dispatch(
                              practiceCategoryApi.util.prefetch('getPracticeCategoryDetail', category.id, {
                                ifOlderThan: 60 * 5,
                              })
                            );
                          }}
                          onEdit={() => {
                            setEditingCategory(category);
                            setFormOpen(true);
                          }}
                          onAction={kind => setAction({ kind, category })}
                          onMove={offset => moveCategory(category.id, offset)}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </section>

        {dirty && (
          <div
            className="sticky bottom-4 z-30 flex flex-col gap-3 rounded-lg border border-amber-300 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between"
            role="status">
            <div>
              <p className="font-medium text-gray-900">Save the new category order?</p>
              <p className="text-sm text-roman-stone">The new order is local until you save it.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={orderPending} onClick={() => setCategoryOrder(null)}>
                Discard changes
              </Button>
              <Button type="button" disabled={orderPending} onClick={() => void saveOrder()}>
                {orderPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {orderPending ? 'Saving order…' : 'Save order'}
              </Button>
            </div>
          </div>
        )}
      </main>

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={open => {
          setFormOpen(open);
          if (!open) setEditingCategory(null);
        }}
        mode={editingCategory ? 'edit' : 'create'}
        currentType={lessonType}
        category={editingCategory}
        onSubmit={submitCategory}
      />

      <ConfirmActionDialog
        open={Boolean(action)}
        onOpenChange={open => !open && setAction(null)}
        title={
          action?.kind === 'archive'
            ? `Archive ${action.category.name}?`
            : action?.kind === 'restore'
              ? `Restore ${action.category.name}?`
              : `Delete ${action?.category.name ?? 'category'} permanently?`
        }
        description={actionDescription}
        confirmLabel={
          action?.kind === 'archive'
            ? 'Archive category'
            : action?.kind === 'restore'
              ? 'Restore category'
              : 'Delete permanently'
        }
        destructive={action?.kind !== 'restore'}
        pending={actionPending}
        onConfirm={confirmCategoryAction}
      />

      <ConfirmActionDialog
        open={discardNavigationOpen}
        onOpenChange={open => {
          setDiscardNavigationOpen(open);
          if (!open) setPendingNavigation(null);
        }}
        title="Discard unsaved category order?"
        description="Your reordered categories have not been saved. Leaving this view will restore the last server-confirmed order."
        confirmLabel="Discard and continue"
        destructive
        onConfirm={continuePendingNavigation}
      />
    </div>
  );
}

export default withAdminAuth(PracticeCategoriesPage);
