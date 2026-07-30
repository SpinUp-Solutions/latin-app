'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
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
  isPracticeLessonType,
  LoadingRows,
  parsePracticeCategoryContext,
  practiceLessonTypeLabel,
  useBrowserNavigationProtection,
} from '@/src/components/admin/practice-categories/category-admin-shared';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Checkbox } from '@/src/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Skeleton } from '@/src/components/ui/skeleton';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { PracticeTagManager } from '@/src/components/ui/admin/practice-categories/PracticeTagManager';
import { PracticeTagPicker } from '@/src/components/ui/admin/practice-categories/PracticeTagPicker';
import { getApiErrorMessage, hasApiErrorStatus } from '@/src/store/api/baseQuery';
import {
  useAddPracticeCategoryLessonsMutation,
  useDeletePracticeCategoryMutation,
  useGetPracticeCategoryDetailQuery,
  useLazyGetAvailablePracticeCategoryLessonsQuery,
  useRemovePracticeCategoryLessonMutation,
  useReorderPracticeCategoryLessonsMutation,
  useUpdatePracticeMembershipTagsMutation,
  useUpdatePracticeCategoryMutation,
} from '@/src/store/api/practiceCategoryApi';
import type { LessonSummary } from '@/src/types/lesson';
import type {
  PracticeCategoryLesson,
  PracticeCategoryStatus,
  PracticeCategoryWithCounts,
  PracticeLessonType,
  PracticeTag,
} from '@/src/types/practice-category';
import { haveSameIdOrder, orderByIds } from '@/src/utils/orderByIds';
import { AdminPage, AdminPageHeader, AdminStatusBadge } from '@/src/components/admin/shell';

const EMPTY_LESSONS: PracticeCategoryLesson[] = [];

const lessonIds = (lessons: PracticeCategoryLesson[]) => lessons.map(lesson => lesson.id);

const plainRichText = (value: string) =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

function MembershipTagPicker({
  tags,
  selectedTagIds,
  disabled,
  pending,
  allowNewSelections,
  onCommit,
}: {
  tags: PracticeTag[];
  selectedTagIds: string[];
  disabled: boolean;
  pending: boolean;
  allowNewSelections: boolean;
  onCommit: (tagIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftTagIds, setDraftTagIds] = useState(selectedTagIds);

  useEffect(() => {
    if (!open) setDraftTagIds(selectedTagIds);
  }, [open, selectedTagIds]);

  return (
    <PracticeTagPicker
      tags={tags}
      selectedTagIds={draftTagIds}
      onChange={setDraftTagIds}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (
          !nextOpen &&
          (draftTagIds.length !== selectedTagIds.length ||
            draftTagIds.some((tagId, index) => tagId !== selectedTagIds[index]))
        ) {
          onCommit(draftTagIds);
        }
      }}
      disabled={disabled || pending}
      allowNewSelections={allowNewSelections}
      className="max-w-full"
    />
  );
}

interface SortableMembershipRowProps {
  lesson: PracticeCategoryLesson;
  position: number;
  total: number;
  orderingEnabled: boolean;
  mutationDisabled: boolean;
  removePending: boolean;
  tags: PracticeTag[];
  tagsPending: boolean;
  allowNewTagSelections: boolean;
  onMove: (offset: -1 | 1) => void;
  onOpenLesson: () => void;
  onRemove: () => void;
  onTagsChange: (tagIds: string[]) => void;
}

function SortableMembershipRow({
  lesson,
  position,
  total,
  orderingEnabled,
  mutationDisabled,
  removePending,
  tags,
  tagsPending,
  allowNewTagSelections,
  onMove,
  onOpenLesson,
  onRemove,
  onTagsChange,
}: SortableMembershipRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lesson.id,
    disabled: !orderingEnabled,
  });
  const lessonTitle = plainRichText(lesson.title) || 'Untitled lesson';

  return (
    <div
      ref={setNodeRef}
      id={`practice-category-lesson-${lesson.id}`}
      tabIndex={-1}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.75 : 1,
      }}
      className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="touch-none rounded-md p-2 text-gray-400 hover:bg-muted hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!orderingEnabled}
          aria-label={`Reorder ${lessonTitle}, position ${position} of ${total}`}
          title={orderingEnabled ? `Drag to reorder ${lessonTitle}` : 'Lesson ordering is unavailable'}
          {...attributes}
          {...listeners}>
          <GripVertical className="h-5 w-5" aria-hidden="true" />
        </button>
        {orderingEnabled && (
          <div className="hidden flex-col sm:flex">
            <button
              type="button"
              className="rounded p-0.5 text-gray-400 hover:bg-muted disabled:opacity-25"
              disabled={position === 1}
              onClick={() => onMove(-1)}
              aria-label={`Move ${lessonTitle} up`}>
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-gray-400 hover:bg-muted disabled:opacity-25"
              disabled={position === total}
              onClick={() => onMove(1)}
              aria-label={`Move ${lessonTitle} down`}>
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/admin/lessons/edit/${lesson.id}`}
            className="min-w-0 rounded text-left font-serif text-lg font-semibold text-gray-900 hover:text-roman-red hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Edit ${lessonTitle}`}
            onClick={event => {
              event.preventDefault();
              onOpenLesson();
            }}>
            <SimpleRichDisplay content={lesson.title} className="font-serif text-lg font-semibold" />
          </a>
          <Badge
            variant={lesson.isLive ? 'default' : 'outline'}
            className={lesson.isLive ? 'border-roman-green/20 bg-roman-green' : ''}>
            {lesson.isLive ? 'Live' : 'Draft'}
          </Badge>
        </div>
        {lesson.description && (
          <SimpleRichDisplay content={lesson.description} className="mt-1 line-clamp-2 text-sm text-roman-stone" />
        )}
        <div className="mt-2">
          <MembershipTagPicker
            tags={tags}
            selectedTagIds={lesson.tagIds}
            onCommit={onTagsChange}
            disabled={mutationDisabled}
            pending={tagsPending}
            allowNewSelections={allowNewTagSelections}
          />
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="self-start text-destructive hover:text-destructive sm:self-center"
        disabled={mutationDisabled || removePending}
        title={mutationDisabled ? 'Save or discard lesson order changes first' : undefined}
        onClick={onRemove}>
        {removePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {removePending ? 'Removing…' : 'Remove'}
      </Button>
    </div>
  );
}

interface AddLessonsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: PracticeCategoryWithCounts;
  assignedCount: number;
  lessons: LessonSummary[];
  onAdd: (lessonIds: string[]) => Promise<void>;
}

function AddLessonsDialog({ open, onOpenChange, category, assignedCount, lessons, onAdd }: AddLessonsDialogProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelected([]);
    setSubmitting(false);
    setError(null);
  }, [open]);

  const filteredLessons = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return lessons;
    return lessons.filter(lesson =>
      `${plainRichText(lesson.title)}\n${plainRichText(lesson.description ?? '')}`.toLocaleLowerCase().includes(query)
    );
  }, [lessons, search]);

  const toggle = (lessonId: string, checked: boolean) => {
    setSelected(current =>
      checked ? [...current.filter(id => id !== lessonId), lessonId] : current.filter(id => id !== lessonId)
    );
  };

  const submit = async () => {
    if (selected.length === 0) return;
    const displayedSelectionOrder = lessons.filter(lesson => selected.includes(lesson.id)).map(lesson => lesson.id);
    setSubmitting(true);
    setError(null);
    try {
      await onAdd(displayedSelectionOrder);
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to add selected lessons');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => !submitting && onOpenChange(nextOpen)}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden p-0"
        onOpenAutoFocus={() => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={event => {
          const target = returnFocusRef.current?.isConnected
            ? returnFocusRef.current
            : document.querySelector<HTMLElement>('[data-dialog-focus-fallback]');
          returnFocusRef.current = null;
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
        onEscapeKeyDown={event => submitting && event.preventDefault()}
        onPointerDownOutside={event => submitting && event.preventDefault()}>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Add lessons to {category.name}</DialogTitle>
          <DialogDescription>
            Select {practiceLessonTypeLabel(category.lessonType)} lessons. Live and draft lessons are both eligible;{' '}
            {assignedCount} already assigned.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <label htmlFor="add-lessons-search" className="mb-1.5 block text-sm font-medium">
            Search lessons
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <Input
              id="add-lessons-search"
              className="pl-9 pr-9"
              value={search}
              placeholder="Search title or description"
              onChange={event => setSearch(event.target.value)}
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSearch('')}
                aria-label="Clear lesson search">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-y px-6 py-3">
          {filteredLessons.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-medium text-gray-900">
                {search.trim() ? 'No lessons match your search' : 'All eligible lessons are already assigned'}
              </p>
              <p className="mt-1 text-sm text-roman-stone">
                {search.trim()
                  ? 'Try another title or description.'
                  : 'There are no additional lessons available for this category.'}
              </p>
              {search.trim() && (
                <Button type="button" variant="outline" className="mt-4" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2" role="group" aria-label="Available lessons">
              {filteredLessons.map(lesson => {
                const checked = selected.includes(lesson.id);
                return (
                  <div key={lesson.id} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
                    <Checkbox
                      className="mt-1"
                      checked={checked}
                      onCheckedChange={value => toggle(lesson.id, value === true)}
                      aria-label={`Select ${plainRichText(lesson.title) || 'untitled lesson'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SimpleRichDisplay content={lesson.title} className="font-medium text-gray-900" />
                        <Badge
                          variant={lesson.isLive ? 'default' : 'outline'}
                          className={lesson.isLive ? 'border-roman-green/20 bg-roman-green' : ''}>
                          {lesson.isLive ? 'Live' : 'Draft'}
                        </Badge>
                      </div>
                      {lesson.description && (
                        <SimpleRichDisplay
                          content={lesson.description}
                          className="mt-1 line-clamp-2 text-sm text-roman-stone"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <p
            className="mx-6 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="gap-3 px-6 pb-6 sm:items-center sm:justify-between">
          <p className="text-sm text-roman-stone" aria-live="polite">
            {selected.length} {selected.length === 1 ? 'lesson' : 'lessons'} selected
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={selected.length === 0 || submitting} onClick={() => void submit()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Adding lessons…' : 'Add selected lessons'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CategoryAction = 'archive' | 'restore' | 'delete';

function PracticeCategoryDetailPage() {
  const routeParams = useParams<{ categoryId: string | string[] }>();
  const router = useRouter();
  const categoryId = Array.isArray(routeParams.categoryId) ? routeParams.categoryId[0] : routeParams.categoryId;
  const [urlReady, setUrlReady] = useState(false);
  const [originType, setOriginType] = useState<PracticeLessonType>('vocab');
  const [originStatus, setOriginStatus] = useState<PracticeCategoryStatus>('active');
  const [lessonOrder, setLessonOrder] = useState<string[] | null>(null);
  const [tagOrder, setTagOrder] = useState<string[] | null>(null);
  const [lessonSearch, setLessonSearch] = useState('');
  const [lessonTagFilters, setLessonTagFilters] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removeLesson, setRemoveLesson] = useState<PracticeCategoryLesson | null>(null);
  const [removePendingId, setRemovePendingId] = useState<string | null>(null);
  const [tagUpdatePendingId, setTagUpdatePendingId] = useState<string | null>(null);
  const [categoryAction, setCategoryAction] = useState<CategoryAction | null>(null);
  const [discardNavigationOpen, setDiscardNavigationOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const focusAfterLoad = useRef<string | null>(null);
  const hasOriginContext = useRef(false);
  const {
    currentData: cachedDetail,
    isLoading: detailQueryLoading,
    error: detailQueryError,
    refetch: refetchDetail,
  } = useGetPracticeCategoryDetailQuery(categoryId ?? '', {
    skip: !categoryId || !urlReady,
  });
  const [loadAvailableLessons, { data: availableLessons = [], isFetching: addLoading }] =
    useLazyGetAvailablePracticeCategoryLessonsQuery();
  const [saveCategory, { isLoading: updatePending }] = useUpdatePracticeCategoryMutation();
  const [deleteCategory, { isLoading: deletePending }] = useDeletePracticeCategoryMutation();
  const [addCategoryLessons] = useAddPracticeCategoryLessonsMutation();
  const [removeCategoryLesson] = useRemovePracticeCategoryLessonMutation();
  const [reorderCategoryLessons, { isLoading: orderPending }] = useReorderPracticeCategoryLessonsMutation();
  const [updateMembershipTags] = useUpdatePracticeMembershipTagsMutation();
  const loading = !urlReady || (detailQueryLoading && !cachedDetail);
  const category = cachedDetail?.category ?? null;
  const serverLessons = cachedDetail?.lessons ?? EMPTY_LESSONS;
  const lessons = useMemo(
    () => (lessonOrder ? orderByIds(serverLessons, lessonOrder) : serverLessons),
    [lessonOrder, serverLessons]
  );
  const lessonOrderDirty = lessonOrder !== null && !haveSameIdOrder(lessonIds(lessons), lessonIds(serverLessons));
  const activeServerTagIds = useMemo(
    () =>
      (category?.tags ?? [])
        .filter(tag => tag.status === 'active')
        .sort((a, b) => a.tagOrder - b.tagOrder || a.id.localeCompare(b.id))
        .map(tag => tag.id),
    [category?.tags]
  );
  const tagOrderDirty = tagOrder !== null && !haveSameIdOrder(tagOrder, activeServerTagIds);
  const dirty = lessonOrderDirty || tagOrderDirty;
  const normalizedLessonSearch = lessonSearch.trim().toLocaleLowerCase();
  const lessonFiltersActive = normalizedLessonSearch.length > 0 || lessonTagFilters.length > 0;
  const visibleLessons = useMemo(
    () =>
      lessons.filter(lesson => {
        const matchesSearch =
          !normalizedLessonSearch ||
          `${plainRichText(lesson.title)}\n${plainRichText(lesson.description ?? '')}`
            .toLocaleLowerCase()
            .includes(normalizedLessonSearch);
        const matchesTags =
          lessonTagFilters.length === 0 || lesson.tagIds.some(tagId => lessonTagFilters.includes(tagId));
        return matchesSearch && matchesTags;
      }),
    [lessonTagFilters, lessons, normalizedLessonSearch]
  );
  const loadError = detailQueryError ? getApiErrorMessage(detailQueryError, 'Unable to load this category') : null;
  const categoryActionPending = updatePending || deletePending;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useBrowserNavigationProtection(dirty, tagOrderDirty ? 'tag order changes' : 'lesson order changes');

  useEffect(() => {
    if (!cachedDetail || hasOriginContext.current) return;
    setOriginType(cachedDetail.category.lessonType);
    setOriginStatus(cachedDetail.category.status);
  }, [cachedDetail]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get('lessonType');
    const statusParam = params.get('status');
    hasOriginContext.current =
      isPracticeLessonType(typeParam) && (statusParam === 'active' || statusParam === 'archived');
    const context = parsePracticeCategoryContext(window.location.search);
    setOriginType(context.lessonType);
    setOriginStatus(context.status);
    setUrlReady(true);
  }, []);

  useEffect(() => {
    const lessonId = focusAfterLoad.current;
    if (!lessonId || loading || addOpen || !lessons.some(lesson => lesson.id === lessonId)) return;
    requestAnimationFrame(() => document.getElementById(`practice-category-lesson-${lessonId}`)?.focus());
    focusAfterLoad.current = null;
  }, [addOpen, lessons, loading]);

  const listHref = `/admin/practice-categories?lessonType=${originType}&status=${originStatus}`;
  const orderingEnabled = category?.status === 'active' && !orderPending && !tagOrderDirty && !lessonFiltersActive;

  const guardHref = (href: string) => {
    if (orderPending) return;
    if (dirty) {
      setPendingHref(href);
      setDiscardNavigationOpen(true);
      return;
    }
    router.push(href);
  };

  const focusCategoryHeading = () => {
    requestAnimationFrame(() => document.getElementById('category-detail-heading')?.focus());
  };

  const focusMembershipHeading = () => {
    requestAnimationFrame(() => {
      const target =
        document.getElementById('membership-heading') ?? document.getElementById('category-detail-heading');
      target?.focus();
    });
  };

  const openAddLessons = async () => {
    if (!category || addLoading) return;
    try {
      await loadAvailableLessons(category.id, true).unwrap();
      setAddOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to load available lessons'));
    }
  };

  const continuePendingNavigation = () => {
    const href = pendingHref;
    setLessonOrder(null);
    setTagOrder(null);
    setDiscardNavigationOpen(false);
    setPendingHref(null);
    if (href) router.push(href);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !orderingEnabled) return;
    const from = lessons.findIndex(lesson => lesson.id === active.id);
    const to = lessons.findIndex(lesson => lesson.id === over.id);
    if (from >= 0 && to >= 0) setLessonOrder(lessonIds(arrayMove(lessons, from, to)));
  };

  const moveLesson = (id: string, offset: -1 | 1) => {
    const from = lessons.findIndex(lesson => lesson.id === id);
    const to = from + offset;
    if (from >= 0 && to >= 0 && to < lessons.length) {
      setLessonOrder(lessonIds(arrayMove(lessons, from, to)));
    }
  };

  const saveOrder = async (desiredIds = lessonIds(lessons)) => {
    if (!category) return;
    try {
      await reorderCategoryLessons({ categoryId: category.id, orderedLessonIds: desiredIds }).unwrap();
      setLessonOrder(null);
      toast.success('Lesson order saved');
    } catch (error) {
      setLessonOrder(null);
      if (hasApiErrorStatus(error, 409)) {
        void refetchDetail();
        toast.error('This lesson list changed elsewhere. The latest order has been loaded.');
      } else {
        toast.error(getApiErrorMessage(error, 'Unable to save lesson order'), {
          action: { label: 'Retry', onClick: () => void saveOrder(desiredIds) },
        });
      }
    }
  };

  const updateCategory = async (submission: CategoryFormSubmission) => {
    if (!category) return;
    await saveCategory({
      categoryId: category.id,
      changes: { name: submission.name, description: submission.description },
    }).unwrap();
    toast.success('Category updated');
  };

  const addLessons = async (selectedLessonIds: string[]) => {
    if (!category) return;
    try {
      await addCategoryLessons({ categoryId: category.id, lessonIds: selectedLessonIds }).unwrap();
      focusAfterLoad.current = selectedLessonIds[0] ?? null;
      toast.success(`${selectedLessonIds.length} ${selectedLessonIds.length === 1 ? 'lesson' : 'lessons'} added`);
    } catch (error) {
      if (hasApiErrorStatus(error, 409)) {
        void refetchDetail();
        toast.error('This category changed elsewhere. The latest lesson list has been loaded.');
      }
      throw error;
    }
  };

  const confirmRemove = async () => {
    if (!category || !removeLesson) return;
    const target = removeLesson;
    setRemovePendingId(target.id);
    try {
      await removeCategoryLesson({ categoryId: category.id, lessonId: target.id }).unwrap();
      setRemoveLesson(null);
      focusMembershipHeading();
      toast.success(`${plainRichText(target.title)} removed from ${category.name}`);
    } catch (error) {
      if (hasApiErrorStatus(error, 409)) {
        setRemoveLesson(null);
        void refetchDetail();
        focusMembershipHeading();
        toast.error('This category changed elsewhere. The latest lesson list has been loaded.');
      } else {
        toast.error(getApiErrorMessage(error, 'Unable to remove the lesson'));
      }
    } finally {
      setRemovePendingId(null);
    }
  };

  const saveMembershipTags = async (lesson: PracticeCategoryLesson, tagIds: string[]) => {
    if (!category) return;
    setTagUpdatePendingId(lesson.id);
    try {
      await updateMembershipTags({
        categoryId: category.id,
        lessonId: lesson.id,
        tagIds,
      }).unwrap();
      toast.success(`Tags updated for ${plainRichText(lesson.title) || 'lesson'}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to update lesson tags'));
    } finally {
      setTagUpdatePendingId(null);
    }
  };

  const filterLessonsByTag = (tagId: string) => {
    setLessonTagFilters([tagId]);
    setLessonSearch('');
    requestAnimationFrame(() => document.getElementById('membership-heading')?.scrollIntoView({ behavior: 'smooth' }));
  };

  const confirmCategoryAction = async () => {
    if (!category || !categoryAction) return;
    try {
      if (categoryAction === 'delete') {
        await deleteCategory(category.id).unwrap();
        toast.success('Category permanently deleted');
        router.push(listHref);
        return;
      }

      const nextStatus = categoryAction === 'archive' ? 'archived' : 'active';
      await saveCategory({ categoryId: category.id, changes: { status: nextStatus } }).unwrap();
      setCategoryAction(null);
      focusCategoryHeading();
      toast.success(categoryAction === 'archive' ? 'Category archived' : 'Category restored');
    } catch (error) {
      if (hasApiErrorStatus(error, 409)) {
        setCategoryAction(null);
        void refetchDetail();
        focusCategoryHeading();
        toast.error('This category changed elsewhere. Its latest state has been loaded.');
      } else {
        toast.error(getApiErrorMessage(error, 'Unable to update the category'));
      }
    }
  };

  const assignedCount = category ? Math.max(getCategoryCounts(category).assigned, lessons.length) : lessons.length;

  const categoryActionDescription = (() => {
    if (!category || !categoryAction) return '';
    if (categoryAction === 'archive') {
      return (
        <>
          <p>
            <strong>{category.name}</strong> has {assignedCount} assigned {assignedCount === 1 ? 'lesson' : 'lessons'}.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Lessons will not be deleted or unpublished.</li>
            <li>Existing assignments and their order will be retained.</li>
            <li>The category will not be offered for new assignments until restored.</li>
          </ul>
        </>
      );
    }
    if (categoryAction === 'restore') {
      return `Restore ${category.name} to Active? It will be appended to the active category order and its lesson membership order will be preserved.`;
    }
    return (
      <>
        Permanently delete <strong>{category.name}</strong>? This operation cannot be undone. No lessons will be
        deleted.
      </>
    );
  })();

  return (
    <>
      <AdminPage>
        {loading && !category ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : category ? (
          <AdminPageHeader
            title={category.name}
            headingProps={{
              id: 'category-detail-heading',
              tabIndex: -1,
              'data-dialog-focus-fallback': true,
            }}
            description={
              category.description || `${assignedCount} assigned ${assignedCount === 1 ? 'lesson' : 'lessons'}.`
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <AdminStatusBadge tone="neutral">{practiceLessonTypeLabel(category.lessonType)}</AdminStatusBadge>
                <AdminStatusBadge tone={category.status === 'active' ? 'success' : 'neutral'}>
                  {category.status === 'active' ? 'Active' : 'Archived'}
                </AdminStatusBadge>
                <Button type="button" variant="outline" disabled={dirty} onClick={() => setFormOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit
                </Button>
                {category.status === 'active' ? (
                  <Button type="button" variant="outline" disabled={dirty} onClick={() => setCategoryAction('archive')}>
                    <Archive className="mr-2 h-4 w-4" aria-hidden="true" /> Archive
                  </Button>
                ) : (
                  <>
                    <Button type="button" onClick={() => setCategoryAction('restore')}>
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Restore
                    </Button>
                    {assignedCount === 0 && (
                      <Button type="button" variant="destructive" onClick={() => setCategoryAction('delete')}>
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Delete permanently
                      </Button>
                    )}
                  </>
                )}
              </div>
            }
          />
        ) : null}
        {loading ? (
          <LoadingRows />
        ) : loadError ? (
          <InlineLoadError message={loadError} onRetry={() => void refetchDetail()} />
        ) : category ? (
          <>
            <PracticeTagManager
              category={category}
              usageCounts={cachedDetail?.tagUsageCounts ?? {}}
              orderedTagIds={tagOrder}
              onOrderChange={setTagOrder}
              orderingBlocked={lessonOrderDirty}
              onFilterLessons={filterLessonsByTag}
            />
            <section
              className="rounded-xl border bg-white/70 p-4 shadow-sm sm:p-6"
              aria-labelledby="membership-heading">
              <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="membership-heading" className="font-serif text-xl text-gray-900" tabIndex={-1}>
                    Lessons in this category
                  </h2>
                  <p className="mt-1 text-sm text-roman-stone">
                    {category.status === 'active'
                      ? 'Order here is independent from publishing order and from every other category.'
                      : 'Assignments remain visible and removable. Restore the category to add or reorder lessons.'}
                  </p>
                </div>
                {category.status === 'active' && (
                  <Button
                    type="button"
                    className="shrink-0"
                    disabled={dirty || addLoading}
                    title={dirty ? 'Save or discard the current order changes first' : undefined}
                    onClick={() => void openAddLessons()}>
                    {addLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {addLoading ? 'Loading lessons…' : 'Add lessons'}
                  </Button>
                )}
              </div>

              {lessonOrderDirty && (
                <p className="mt-4 text-sm font-medium text-amber-700" role="status">
                  Lesson order has unsaved changes. Save or discard it before changing memberships.
                </p>
              )}

              {lessons.length > 0 && (
                <div className="mt-5 flex flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={lessonSearch}
                      className="pl-9 pr-9"
                      placeholder="Search lessons"
                      aria-label="Search lessons in this category"
                      onChange={event => setLessonSearch(event.target.value)}
                    />
                    {lessonSearch && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-muted"
                        onClick={() => setLessonSearch('')}
                        aria-label="Clear lesson search">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <PracticeTagPicker
                    tags={category.tags}
                    selectedTagIds={lessonTagFilters}
                    onChange={setLessonTagFilters}
                    triggerLabel="Filter by tag"
                    allowArchivedSelection
                    className="sm:min-w-52"
                  />
                  {lessonFiltersActive && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLessonSearch('');
                        setLessonTagFilters([]);
                      }}>
                      Clear filters
                    </Button>
                  )}
                  <span className="text-sm text-roman-stone" aria-live="polite">
                    {lessonFiltersActive ? `${visibleLessons.length} of ${lessons.length}` : lessons.length}{' '}
                    {lessons.length === 1 ? 'lesson' : 'lessons'}
                  </span>
                </div>
              )}

              {lessonFiltersActive && lessons.length > 1 && (
                <p className="mt-2 text-xs text-amber-700">Clear lesson filters to reorder the complete list.</p>
              )}

              <div className="mt-5">
                {lessons.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-white px-6 py-12 text-center">
                    {category.status === 'active' ? (
                      <>
                        <h3 className="font-serif text-lg text-gray-900">No lessons in this category yet</h3>
                        <p className="mt-2 text-sm text-roman-stone">
                          Add live or draft {practiceLessonTypeLabel(category.lessonType)} lessons.
                        </p>
                        <Button
                          type="button"
                          className="mt-5"
                          disabled={addLoading}
                          onClick={() => void openAddLessons()}>
                          {addLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                          )}
                          {addLoading ? 'Loading lessons…' : 'Add lessons'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <h3 className="font-serif text-lg text-gray-900">This archived category has no lessons</h3>
                        <p className="mt-2 text-sm text-roman-stone">
                          Restore it to add lessons, or permanently delete it if it is no longer needed.
                        </p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                          <Button type="button" onClick={() => setCategoryAction('restore')}>
                            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Restore
                          </Button>
                          <Button type="button" variant="destructive" onClick={() => setCategoryAction('delete')}>
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Delete permanently
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : visibleLessons.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-white px-6 py-10 text-center">
                    <h3 className="font-serif text-lg text-gray-900">No lessons match these filters</h3>
                    <p className="mt-2 text-sm text-roman-stone">
                      Search and selected tags combine to narrow this category.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        setLessonSearch('');
                        setLessonTagFilters([]);
                      }}>
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    onDragEnd={handleDragEnd}
                    accessibility={{
                      announcements: {
                        onDragStart: ({ active }) => {
                          const lesson = visibleLessons.find(item => item.id === active.id);
                          return lesson ? `Picked up ${plainRichText(lesson.title)}` : 'Picked up lesson';
                        },
                        onDragOver: ({ active, over }) => {
                          const lesson = visibleLessons.find(item => item.id === active.id);
                          const nextPosition = over ? visibleLessons.findIndex(item => item.id === over.id) + 1 : 0;
                          return lesson && nextPosition
                            ? `${plainRichText(lesson.title)} is over position ${nextPosition}`
                            : 'Lesson is no longer over a valid position';
                        },
                        onDragEnd: ({ active, over }) => {
                          const lesson = visibleLessons.find(item => item.id === active.id);
                          const nextPosition = over ? visibleLessons.findIndex(item => item.id === over.id) + 1 : 0;
                          return lesson && nextPosition
                            ? `${plainRichText(lesson.title)} moved to position ${nextPosition}`
                            : 'Lesson movement ended';
                        },
                        onDragCancel: ({ active }) => {
                          const lesson = visibleLessons.find(item => item.id === active.id);
                          return lesson
                            ? `Movement cancelled for ${plainRichText(lesson.title)}`
                            : 'Lesson movement cancelled';
                        },
                      },
                    }}>
                    <SortableContext items={lessonIds(visibleLessons)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {visibleLessons.map((lesson, index) => (
                          <SortableMembershipRow
                            key={lesson.id}
                            lesson={lesson}
                            position={index + 1}
                            total={visibleLessons.length}
                            orderingEnabled={Boolean(orderingEnabled)}
                            mutationDisabled={lessonOrderDirty}
                            removePending={removePendingId === lesson.id}
                            tags={category.tags}
                            tagsPending={tagUpdatePendingId === lesson.id}
                            allowNewTagSelections={category.status === 'active'}
                            onMove={offset => moveLesson(lesson.id, offset)}
                            onOpenLesson={() => guardHref(`/admin/lessons/edit/${lesson.id}`)}
                            onRemove={() => setRemoveLesson(lesson)}
                            onTagsChange={tagIds => void saveMembershipTags(lesson, tagIds)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </section>
          </>
        ) : null}

        {lessonOrderDirty && (
          <div
            className="sticky bottom-4 z-30 flex flex-col gap-3 rounded-lg border border-amber-300 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between"
            role="status">
            <div>
              <p className="font-medium text-gray-900">Save the new lesson order?</p>
              <p className="text-sm text-roman-stone">This changes only the order inside {category?.name}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={orderPending} onClick={() => setLessonOrder(null)}>
                Discard changes
              </Button>
              <Button type="button" disabled={orderPending} onClick={() => void saveOrder()}>
                {orderPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {orderPending ? 'Saving order…' : 'Save order'}
              </Button>
            </div>
          </div>
        )}
      </AdminPage>

      {category && (
        <>
          <CategoryFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            mode="edit"
            currentType={category.lessonType}
            category={category}
            onSubmit={updateCategory}
          />
          <AddLessonsDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            category={category}
            assignedCount={assignedCount}
            lessons={availableLessons}
            onAdd={addLessons}
          />
        </>
      )}

      <ConfirmActionDialog
        open={Boolean(removeLesson)}
        onOpenChange={open => !open && setRemoveLesson(null)}
        title={`Remove ${removeLesson ? plainRichText(removeLesson.title) : 'lesson'} from ${category?.name ?? 'category'}?`}
        description={
          <>
            <p>Only this category assignment will be removed.</p>
            <p>
              The lesson, its <strong>{removeLesson?.isLive ? 'Live' : 'Draft'}</strong> publication status, and its
              assignments to other categories will remain unchanged.
            </p>
          </>
        }
        confirmLabel="Remove assignment"
        destructive
        pending={Boolean(removePendingId)}
        onConfirm={confirmRemove}
      />

      <ConfirmActionDialog
        open={Boolean(categoryAction)}
        onOpenChange={open => !open && setCategoryAction(null)}
        title={
          categoryAction === 'archive'
            ? `Archive ${category?.name ?? 'category'}?`
            : categoryAction === 'restore'
              ? `Restore ${category?.name ?? 'category'}?`
              : `Delete ${category?.name ?? 'category'} permanently?`
        }
        description={categoryActionDescription}
        confirmLabel={
          categoryAction === 'archive'
            ? 'Archive category'
            : categoryAction === 'restore'
              ? 'Restore category'
              : 'Delete permanently'
        }
        destructive={categoryAction !== 'restore'}
        pending={categoryActionPending}
        onConfirm={confirmCategoryAction}
      />

      <ConfirmActionDialog
        open={discardNavigationOpen}
        onOpenChange={open => {
          setDiscardNavigationOpen(open);
          if (!open) setPendingHref(null);
        }}
        title={`Discard unsaved ${tagOrderDirty ? 'tag' : 'lesson'} order?`}
        description={`Your reordered ${
          tagOrderDirty ? 'tags' : 'lessons'
        } have not been saved. Leaving this page will restore the last server-confirmed order.`}
        confirmLabel="Discard and continue"
        destructive
        onConfirm={continuePendingNavigation}
      />
    </>
  );
}

export default withAdminAuth(PracticeCategoryDetailPage);
