'use client';

import React, { useMemo } from 'react';
import { Badge } from '@/src/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { cn } from '@/src/lib/utils';
import type { PracticeCategorySummary } from '@/src/types/practice-category';

interface PracticeCategoryChipsProps {
  categories?: PracticeCategorySummary[];
  maxVisible?: number;
  className?: string;
  emptyLabel?: string;
}

const categorySort = (a: PracticeCategorySummary, b: PracticeCategorySummary) =>
  (a.categoryOrder ?? Number.MAX_SAFE_INTEGER) - (b.categoryOrder ?? Number.MAX_SAFE_INTEGER) ||
  a.name.localeCompare(b.name) ||
  a.id.localeCompare(b.id);

function CategoryBadge({ category }: { category: PracticeCategorySummary }) {
  const archived = category.status === 'archived';

  return (
    <Badge
      variant={archived ? 'outline' : 'secondary'}
      className={cn(
        'max-w-full whitespace-nowrap border-primary/15 bg-primary/[0.08] font-medium text-primary shadow-[0_1px_2px_rgb(15_23_42/0.04)]',
        archived && 'border-border bg-roman-marble text-roman-stone shadow-none'
      )}
      title={archived ? `${category.name} (Archived)` : category.name}>
      <span className="truncate">{category.name}</span>
      {archived && <span className="font-medium">Archived</span>}
    </Badge>
  );
}

export function PracticeCategoryChips({
  categories = [],
  maxVisible = 3,
  className,
  emptyLabel,
}: PracticeCategoryChipsProps) {
  const sortedCategories = useMemo(() => [...categories].sort(categorySort), [categories]);

  if (sortedCategories.length === 0) {
    return emptyLabel ? <span className={cn('text-xs text-gray-500', className)}>{emptyLabel}</span> : null;
  }

  const visibleCategories = sortedCategories.slice(0, maxVisible);
  const hiddenCategories = sortedCategories.slice(maxVisible);
  const hiddenNames = hiddenCategories
    .map(category => `${category.name}${category.status === 'archived' ? ' (Archived)' : ''}`)
    .join(', ');

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)} aria-label="Lesson categories">
      {visibleCategories.map(category => (
        <CategoryBadge key={category.id} category={category} />
      ))}
      {hiddenCategories.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex rounded-full border border-primary/15 bg-primary/[0.06] px-2.5 py-1 text-xs font-medium leading-none text-primary shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[background-color,border-color] hover:border-primary/25 hover:bg-primary/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`${hiddenCategories.length} more categories: ${hiddenNames}`}>
              +{hiddenCategories.length} more
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <p className="mb-2 text-xs font-medium text-gray-600">All categories</p>
            <div className="flex flex-wrap gap-1.5">
              {sortedCategories.map(category => (
                <CategoryBadge key={category.id} category={category} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
