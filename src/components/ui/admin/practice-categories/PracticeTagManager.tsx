'use client';

import { useMemo, useState } from 'react';
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
import { ConfirmActionDialog } from '@/src/components/admin/practice-categories/category-admin-shared';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { getApiErrorMessage, hasApiErrorStatus } from '@/src/store/api/baseQuery';
import {
  useCreatePracticeTagMutation,
  useDeletePracticeTagMutation,
  useReorderPracticeTagsMutation,
  useUpdatePracticeTagMutation,
} from '@/src/store/api/practiceCategoryApi';
import type { PracticeCategoryWithCounts, PracticeTag } from '@/src/types/practice-category';
import { haveSameIdOrder, orderByIds } from '@/src/utils/orderByIds';

type TagView = 'active' | 'archived';
type TagAction = { kind: 'archive' | 'restore' | 'delete'; tag: PracticeTag };
type TagForm = { mode: 'create' } | { mode: 'rename'; tag: PracticeTag };

interface PracticeTagManagerProps {
  category: PracticeCategoryWithCounts;
  usageCounts: Record<string, number>;
  orderedTagIds: string[] | null;
  onOrderChange: (tagIds: string[] | null) => void;
  orderingBlocked: boolean;
  onFilterLessons: (tagId: string) => void;
}

interface SortableTagRowProps {
  tag: PracticeTag;
  usageCount: number;
  position: number;
  total: number;
  orderingEnabled: boolean;
  pending: boolean;
  onMove: (offset: -1 | 1) => void;
  onRename: () => void;
  onAction: (kind: TagAction['kind']) => void;
  onFilterLessons: () => void;
}

const byTagOrder = (a: PracticeTag, b: PracticeTag) =>
  a.tagOrder - b.tagOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

function SortableTagRow({
  tag,
  usageCount,
  position,
  total,
  orderingEnabled,
  pending,
  onMove,
  onRename,
  onAction,
  onFilterLessons,
}: SortableTagRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.id,
    disabled: !orderingEnabled,
  });
  const archived = tag.status === 'archived';

  return (
    <div
      ref={setNodeRef}
      id={`practice-tag-${tag.id}`}
      tabIndex={-1}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.75 : 1,
      }}
      className="flex flex-wrap items-center gap-2 rounded-md border bg-white px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {!archived && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className="touch-none rounded p-1.5 text-gray-400 hover:bg-muted hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!orderingEnabled}
            aria-label={`Reorder ${tag.name}, position ${position} of ${total}`}
            {...attributes}
            {...listeners}>
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="hidden flex-col sm:flex">
            <button
              type="button"
              className="rounded p-0.5 text-gray-400 hover:bg-muted disabled:opacity-25"
              disabled={!orderingEnabled || position === 1}
              onClick={() => onMove(-1)}
              aria-label={`Move ${tag.name} up`}>
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-gray-400 hover:bg-muted disabled:opacity-25"
              disabled={!orderingEnabled || position === total}
              onClick={() => onMove(1)}
              aria-label={`Move ${tag.name} down`}>
              <ArrowDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="min-w-32 flex-1">
        <span className="text-sm font-medium text-gray-900">{tag.name}</span>
        {archived && (
          <Badge variant="outline" className="ml-2 px-1.5 py-0 text-[10px] text-gray-500">
            Archived
          </Badge>
        )}
      </div>

      <button
        type="button"
        className="rounded px-2 py-1 text-xs text-roman-stone hover:bg-muted hover:text-gray-900 hover:underline"
        onClick={onFilterLessons}>
        {usageCount === 0 ? 'Not used' : `${usageCount} ${usageCount === 1 ? 'lesson' : 'lessons'}`}
      </button>

      <div className="flex items-center gap-1">
        {!archived && (
          <>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onRename}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Rename
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onAction('archive')}>
              <Archive className="mr-1.5 h-3.5 w-3.5" /> Archive
            </Button>
          </>
        )}
        {archived && (
          <>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onAction('restore')}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={pending || usageCount > 0}
              title={
                usageCount > 0
                  ? `${tag.name} is used by ${usageCount} ${
                      usageCount === 1 ? 'lesson' : 'lessons'
                    }. Remove it from those lessons before deleting.`
                  : undefined
              }
              onClick={() => onAction('delete')}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function PracticeTagManager({
  category,
  usageCounts,
  orderedTagIds,
  onOrderChange,
  orderingBlocked,
  onFilterLessons,
}: PracticeTagManagerProps) {
  const [view, setView] = useState<TagView>('active');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<TagForm | null>(null);
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [action, setAction] = useState<TagAction | null>(null);
  const [pendingTagId, setPendingTagId] = useState<string | null>(null);
  const [createTag, { isLoading: createPending }] = useCreatePracticeTagMutation();
  const [updateTag, { isLoading: updatePending }] = useUpdatePracticeTagMutation();
  const [deleteTag, { isLoading: deletePending }] = useDeletePracticeTagMutation();
  const [reorderTags, { isLoading: reorderPending }] = useReorderPracticeTagsMutation();

  const activeServerTags = useMemo(
    () => category.tags.filter(tag => tag.status === 'active').sort(byTagOrder),
    [category.tags]
  );
  const activeTags = useMemo(
    () => (orderedTagIds ? orderByIds(activeServerTags, orderedTagIds) : activeServerTags),
    [activeServerTags, orderedTagIds]
  );
  const archivedTags = useMemo(
    () => category.tags.filter(tag => tag.status === 'archived').sort(byTagOrder),
    [category.tags]
  );
  const sourceTags = view === 'active' ? activeTags : archivedTags;
  const query = search.trim().toLocaleLowerCase();
  const visibleTags = query ? sourceTags.filter(tag => tag.name.toLocaleLowerCase().includes(query)) : sourceTags;
  const dirty =
    orderedTagIds !== null &&
    !haveSameIdOrder(
      orderedTagIds,
      activeServerTags.map(tag => tag.id)
    );
  const orderingEnabled =
    view === 'active' && !query && category.status === 'active' && !orderingBlocked && !reorderPending;
  const mutationPending = createPending || updatePending || deletePending;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const openForm = (next: TagForm) => {
    setForm(next);
    setFormName(next.mode === 'rename' ? next.tag.name : '');
    setFormError(null);
  };

  const submitForm = async () => {
    const name = formName.trim();
    if (!form || !name) {
      setFormError('Tag name is required');
      return;
    }
    setFormError(null);
    try {
      if (form.mode === 'create') {
        const result = await createTag({ categoryId: category.id, name }).unwrap();
        if (orderedTagIds) onOrderChange([...orderedTagIds, result.tag.id]);
        setView('active');
        toast.success(`${result.tag.name} created`);
        requestAnimationFrame(() => document.getElementById(`practice-tag-${result.tag.id}`)?.focus());
      } else {
        await updateTag({
          categoryId: category.id,
          tagId: form.tag.id,
          changes: { name },
        }).unwrap();
        toast.success('Tag renamed');
        requestAnimationFrame(() => document.getElementById(`practice-tag-${form.tag.id}`)?.focus());
      }
      setForm(null);
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Unable to save the tag'));
    }
  };

  const confirmAction = async () => {
    if (!action) return;
    setPendingTagId(action.tag.id);
    try {
      if (action.kind === 'delete') {
        await deleteTag({ categoryId: category.id, tagId: action.tag.id }).unwrap();
        toast.success(`${action.tag.name} permanently deleted`);
      } else {
        const status = action.kind === 'archive' ? 'archived' : 'active';
        const result = await updateTag({
          categoryId: category.id,
          tagId: action.tag.id,
          changes: { status },
        }).unwrap();
        if (orderedTagIds) {
          onOrderChange(
            action.kind === 'archive'
              ? orderedTagIds.filter(tagId => tagId !== action.tag.id)
              : [...orderedTagIds, result.tag.id]
          );
        }
        setView(status);
        toast.success(action.kind === 'archive' ? 'Tag archived' : 'Tag restored');
      }
      setAction(null);
    } catch (error) {
      if (hasApiErrorStatus(error, 409)) onOrderChange(null);
      toast.error(getApiErrorMessage(error, 'Unable to update the tag'));
    } finally {
      setPendingTagId(null);
    }
  };

  const moveTag = (id: string, offset: -1 | 1) => {
    if (!orderingEnabled) return;
    const from = activeTags.findIndex(tag => tag.id === id);
    const to = from + offset;
    if (from >= 0 && to >= 0 && to < activeTags.length) {
      onOrderChange(arrayMove(activeTags, from, to).map(tag => tag.id));
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !orderingEnabled) return;
    const from = activeTags.findIndex(tag => tag.id === active.id);
    const to = activeTags.findIndex(tag => tag.id === over.id);
    if (from >= 0 && to >= 0) onOrderChange(arrayMove(activeTags, from, to).map(tag => tag.id));
  };

  const saveOrder = async () => {
    const desiredIds = activeTags.map(tag => tag.id);
    try {
      await reorderTags({ categoryId: category.id, orderedTagIds: desiredIds }).unwrap();
      onOrderChange(null);
      toast.success('Tag order saved');
    } catch (error) {
      onOrderChange(null);
      toast.error(
        hasApiErrorStatus(error, 409)
          ? 'This tag list changed elsewhere. The latest order has been loaded.'
          : getApiErrorMessage(error, 'Unable to save tag order')
      );
    }
  };

  return (
    <section className="rounded-xl border bg-white/70 p-4 shadow-sm sm:p-6" aria-labelledby="tag-management-heading">
      <div className="flex flex-col gap-4 border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="tag-management-heading" className="font-serif text-xl text-gray-900">
              Tags
            </h2>
            <p className="mt-1 text-sm text-roman-stone">
              Tags belong only to {category.name} and filter lessons inside this category.
            </p>
          </div>
          <Button
            type="button"
            disabled={category.status !== 'active' || createPending}
            title={category.status !== 'active' ? 'Restore the category before creating tags' : undefined}
            onClick={() => openForm({ mode: 'create' })}>
            <Plus className="mr-2 h-4 w-4" /> Create tag
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex w-fit rounded-md border bg-white p-0.5" aria-label="Tag status">
            <Button
              type="button"
              size="sm"
              variant={view === 'active' ? 'secondary' : 'ghost'}
              onClick={() => setView('active')}>
              Active <span className="ml-1 tabular-nums">{activeTags.length}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === 'archived' ? 'secondary' : 'ghost'}
              onClick={() => setView('archived')}>
              Archived <span className="ml-1 tabular-nums">{archivedTags.length}</span>
            </Button>
          </div>
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              className="pl-9 pr-9"
              placeholder="Search tags"
              aria-label="Search tags"
              onChange={event => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-muted"
                onClick={() => setSearch('')}
                aria-label="Clear tag search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <span className="text-sm text-roman-stone">
            {visibleTags.length} {visibleTags.length === 1 ? 'tag' : 'tags'}
          </span>
        </div>
        {view === 'active' && !orderingEnabled && activeTags.length > 1 && (
          <p className="text-xs text-amber-700">
            {query
              ? 'Clear the search to reorder tags.'
              : orderingBlocked
                ? 'Save or discard lesson order changes first.'
                : category.status !== 'active'
                  ? 'Restore the category to reorder tags.'
                  : ''}
          </p>
        )}
      </div>

      <div className="mt-4">
        {visibleTags.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white px-6 py-8 text-center">
            <p className="font-medium text-gray-900">
              {query ? 'No tags match your search' : view === 'active' ? 'No active tags yet' : 'No archived tags'}
            </p>
            {!query && view === 'active' && category.status === 'active' && (
              <Button type="button" variant="outline" className="mt-4" onClick={() => openForm({ mode: 'create' })}>
                <Plus className="mr-2 h-4 w-4" /> Create the first tag
              </Button>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleTags.map(tag => tag.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {visibleTags.map((tag, index) => (
                  <SortableTagRow
                    key={tag.id}
                    tag={tag}
                    usageCount={usageCounts[tag.id] ?? 0}
                    position={index + 1}
                    total={visibleTags.length}
                    orderingEnabled={orderingEnabled}
                    pending={pendingTagId === tag.id}
                    onMove={offset => moveTag(tag.id, offset)}
                    onRename={() => openForm({ mode: 'rename', tag })}
                    onAction={kind => setAction({ kind, tag })}
                    onFilterLessons={() => onFilterLessons(tag.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {dirty && (
        <div className="sticky bottom-4 z-30 mt-5 flex flex-col gap-3 rounded-lg border border-amber-300 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-gray-900">Save the new tag order?</p>
            <p className="text-sm text-roman-stone">This changes only the filter order inside {category.name}.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={reorderPending} onClick={() => onOrderChange(null)}>
              Discard changes
            </Button>
            <Button type="button" disabled={reorderPending} onClick={() => void saveOrder()}>
              {reorderPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {reorderPending ? 'Saving order…' : 'Save order'}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(form)} onOpenChange={open => !open && !mutationPending && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.mode === 'rename' ? 'Rename tag' : 'Create tag'}</DialogTitle>
            <DialogDescription>
              Tag names are unique inside {category.name}; another category may use the same name.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="practice-tag-name" className="mb-1.5 block text-sm font-medium">
              Tag name
            </label>
            <Input
              id="practice-tag-name"
              value={formName}
              autoFocus
              disabled={mutationPending}
              aria-invalid={Boolean(formError)}
              onChange={event => {
                setFormName(event.target.value);
                setFormError(null);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitForm();
                }
              }}
            />
            {formError && (
              <p className="mt-1.5 text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutationPending} onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!formName.trim() || mutationPending} onClick={() => void submitForm()}>
              {mutationPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form?.mode === 'rename' ? 'Save name' : 'Create tag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(action)}
        onOpenChange={open => !open && !mutationPending && setAction(null)}
        title={
          action?.kind === 'archive'
            ? `Archive ${action.tag.name}?`
            : action?.kind === 'restore'
              ? `Restore ${action.tag.name}?`
              : `Delete ${action?.tag.name ?? 'tag'} permanently?`
        }
        description={
          action?.kind === 'archive'
            ? 'Existing lesson assignments will remain visible and removable. The tag will no longer be available for new assignments or student filtering.'
            : action?.kind === 'restore'
              ? 'The tag will return to Active at the end of the filter order.'
              : 'This permanently removes the unused archived tag and cannot be undone.'
        }
        confirmLabel={
          action?.kind === 'archive' ? 'Archive tag' : action?.kind === 'restore' ? 'Restore tag' : 'Delete permanently'
        }
        destructive={action?.kind !== 'restore'}
        pending={mutationPending}
        onConfirm={confirmAction}
      />
    </section>
  );
}
