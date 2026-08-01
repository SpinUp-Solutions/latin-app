'use client';

import React, { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronsUpDown, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Checkbox } from '@/src/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/src/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { cn } from '@/src/lib/utils';
import { useGetPracticeCategoriesQuery } from '@/src/store/api/practiceCategoryApi';
import type {
  PracticeCategorySelection,
  PracticeCategorySummary,
  PracticeLessonType,
} from '@/src/types/practice-category';
import { PracticeTagPicker } from './PracticeTagPicker';

interface PracticeCategorySelectorProps {
  lessonType: PracticeLessonType;
  selectedIds?: string[];
  selectedSelections?: PracticeCategorySelection[];
  assignedCategories?: PracticeCategorySummary[];
  onChange?: (categoryIds: string[], selectedCategories: PracticeCategorySummary[]) => void;
  onSelectionChange?: (selections: PracticeCategorySelection[], selectedCategories: PracticeCategorySummary[]) => void;
  disabled?: boolean;
}

const categorySort = (a: PracticeCategorySummary, b: PracticeCategorySummary) =>
  (a.categoryOrder ?? Number.MAX_SAFE_INTEGER) - (b.categoryOrder ?? Number.MAX_SAFE_INTEGER) ||
  a.name.localeCompare(b.name) ||
  a.id.localeCompare(b.id);

function SelectorChip({ category }: { category: PracticeCategorySummary }) {
  const archived = category.status === 'archived';
  return (
    <Badge
      variant={archived ? 'outline' : 'secondary'}
      className={cn(
        'max-w-[9rem] whitespace-nowrap border-primary/15 bg-primary/[0.08] px-2 py-1 text-xs font-medium text-primary shadow-[0_1px_2px_rgb(15_23_42/0.04)]',
        archived && 'border-border bg-roman-marble text-roman-stone shadow-none'
      )}>
      <span className="truncate">{category.name}</span>
      {archived && <span className="font-medium">Archived</span>}
    </Badge>
  );
}

export function PracticeCategorySelector({
  lessonType,
  selectedIds = [],
  selectedSelections,
  assignedCategories = [],
  onChange,
  onSelectionChange,
  disabled = false,
}: PracticeCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const categoryListId = useId();
  const {
    data: activeCategories = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetPracticeCategoriesQuery({ lessonType, status: 'active' });
  const selections = useMemo(
    () =>
      selectedSelections ??
      selectedIds.map(categoryId => ({
        categoryId,
        tagIds: [],
      })),
    [selectedIds, selectedSelections]
  );
  const resolvedSelectedIds = useMemo(() => selections.map(selection => selection.categoryId), [selections]);

  const allKnownCategories = useMemo(() => {
    const byId = new Map<string, PracticeCategorySummary>();
    assignedCategories.forEach(category => byId.set(category.id, category));
    activeCategories.forEach(category => byId.set(category.id, category));
    return byId;
  }, [activeCategories, assignedCategories]);

  const selectedCategories = useMemo(
    () =>
      resolvedSelectedIds
        .map(id => allKnownCategories.get(id))
        .filter((category): category is PracticeCategorySummary => Boolean(category))
        .sort(categorySort),
    [allKnownCategories, resolvedSelectedIds]
  );

  const selectedActiveCategories = selectedCategories.filter(category => category.status === 'active');
  const selectedArchivedCategories = selectedCategories.filter(category => category.status === 'archived');
  const selectedTagCount = selections.reduce((total, selection) => total + selection.tagIds.length, 0);
  const availableCategories = [...activeCategories]
    .filter(category => !resolvedSelectedIds.includes(category.id))
    .sort(categorySort);
  const visibleChips = selectedCategories.slice(0, 3);
  const overflowCount = Math.max(0, selectedCategories.length - visibleChips.length);

  const handleToggle = (category: PracticeCategorySummary) => {
    const nextSelections = resolvedSelectedIds.includes(category.id)
      ? selections.filter(selection => selection.categoryId !== category.id)
      : [...selections, { categoryId: category.id, tagIds: [] }];
    const nextIds = nextSelections.map(selection => selection.categoryId);
    const nextCategories = nextIds
      .map(id => allKnownCategories.get(id))
      .filter((value): value is PracticeCategorySummary => Boolean(value))
      .sort(categorySort);
    onChange?.(nextIds, nextCategories);
    onSelectionChange?.(nextSelections, nextCategories);
  };

  const handleTagsChange = (categoryId: string, tagIds: string[]) => {
    const nextSelections = selections.map(selection =>
      selection.categoryId === categoryId ? { ...selection, tagIds } : selection
    );
    onSelectionChange?.(nextSelections, selectedCategories);
    onChange?.(resolvedSelectedIds, selectedCategories);
  };

  const renderOption = (category: PracticeCategorySummary) => {
    const selected = resolvedSelectedIds.includes(category.id);
    const archived = category.status === 'archived';
    return (
      <CommandItem
        key={category.id}
        value={`${category.name} ${category.id}`}
        onSelect={() => handleToggle(category)}
        className="gap-2"
        aria-label={`${selected ? 'Remove' : 'Add'} ${category.name}${archived ? ' archived category' : ''}`}>
        <Checkbox
          checked={selected}
          tabIndex={-1}
          aria-label={`${category.name} ${selected ? 'selected' : 'not selected'}`}
          className="pointer-events-none"
        />
        <span className={cn('min-w-0 flex-1 truncate', archived && 'text-gray-500')}>{category.name}</span>
        {archived && (
          <Badge variant="outline" className="border-border bg-roman-marble px-1.5 py-0.5 text-[10px] text-roman-stone">
            Archived
          </Badge>
        )}
        {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
      </CommandItem>
    );
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={categoryListId}
            aria-haspopup="listbox"
            aria-label="Select practice categories"
            disabled={disabled || isLoading}
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 py-1.5 text-left text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {isLoading ? (
                <span className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading categories…
                </span>
              ) : visibleChips.length === 0 ? (
                <span className="text-gray-500">Choose categories…</span>
              ) : (
                <>
                  {visibleChips.map(category => (
                    <SelectorChip key={category.id} category={category} />
                  ))}
                  {overflowCount > 0 && (
                    <span className="text-xs font-medium text-gray-600">+{overflowCount} more</span>
                  )}
                </>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
          <Command>
            <CommandInput placeholder="Search categories…" aria-label="Search categories" />
            <CommandList id={categoryListId} aria-multiselectable="true">
              <CommandEmpty>{isError ? 'Categories could not be loaded.' : 'No categories found.'}</CommandEmpty>
              {selectedActiveCategories.length > 0 && (
                <CommandGroup heading="Selected">{selectedActiveCategories.map(renderOption)}</CommandGroup>
              )}
              {selectedArchivedCategories.length > 0 && (
                <>
                  {selectedActiveCategories.length > 0 && <CommandSeparator />}
                  <CommandGroup heading="Archived assignments">
                    {selectedArchivedCategories.map(renderOption)}
                  </CommandGroup>
                </>
              )}
              {availableCategories.length > 0 && (
                <>
                  {(selectedActiveCategories.length > 0 || selectedArchivedCategories.length > 0) && (
                    <CommandSeparator />
                  )}
                  <CommandGroup heading="Available">{availableCategories.map(renderOption)}</CommandGroup>
                </>
              )}
            </CommandList>
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <span className="text-xs text-gray-500" aria-live="polite">
                {resolvedSelectedIds.length === 0 ? 'No categories selected' : `${resolvedSelectedIds.length} selected`}
              </span>
              {isFetching && !isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />}
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500" aria-live="polite">
          {resolvedSelectedIds.length === 0
            ? 'No categories assigned'
            : `${resolvedSelectedIds.length} ${
                resolvedSelectedIds.length === 1 ? 'category' : 'categories'
              } assigned · ${selectedTagCount} ${selectedTagCount === 1 ? 'tag' : 'tags'} selected`}
        </p>
        <Link
          href={`/admin/practice-categories?lessonType=${encodeURIComponent(lessonType)}&status=active`}
          target="_blank"
          rel="noreferrer"
          aria-label="Manage Practice Categories (opens in a new tab)"
          className="inline-flex items-center gap-1 text-xs font-medium text-roman-red hover:underline">
          Manage Practice Categories
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {isError && (
        <div className="flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          <span>Active categories could not be loaded. Existing assignments are preserved.</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void refetch()}>
            <RefreshCw className="mr-1 h-3 w-3" /> Retry
          </Button>
        </div>
      )}

      {selectedCategories.length > 0 && (
        <div className="space-y-2 pt-1">
          {selectedCategories.map(category => {
            const selection = selections.find(candidate => candidate.categoryId === category.id);
            return (
              <div
                key={category.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50/70 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-gray-800">{category.name}</span>
                    {category.status === 'archived' && (
                      <Badge
                        variant="outline"
                        className="border-border bg-roman-marble px-1.5 py-0.5 text-[10px] text-roman-stone">
                        Archived
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {(selection?.tagIds.length ?? 0) === 0
                      ? 'No tags selected — this lesson appears under All.'
                      : 'Tags apply only inside this category.'}
                  </p>
                </div>
                <PracticeTagPicker
                  tags={category.tags ?? []}
                  selectedTagIds={selection?.tagIds ?? []}
                  onChange={tagIds => handleTagsChange(category.id, tagIds)}
                  disabled={disabled}
                  allowNewSelections={category.status === 'active'}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
