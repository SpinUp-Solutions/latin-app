'use client';

import React, { useId, useState } from 'react';
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';
import { VocabularyFilters } from '@/src/types/admin-vocabulary';
import type { WordType } from '@/shared/types/vocabulary/schemas/enums';

interface VocabularyFiltersProps {
  filters: VocabularyFilters;
  wordTypeCounts: Record<string, number>;
  countsLoading: boolean;
  onFiltersChange: (filters: Partial<VocabularyFilters>) => void;
  onSearch: (e: React.FormEvent) => void;
  onReset: () => void;
}

const WORD_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'noun', label: 'Nouns' },
  { value: 'verb', label: 'Verbs' },
  { value: 'adjective', label: 'Adjectives' },
  { value: 'adverb', label: 'Adverbs' },
  { value: 'preposition', label: 'Prepositions' },
  { value: 'pronoun', label: 'Pronouns' },
  { value: 'conjunction', label: 'Conjunctions' },
  { value: 'interjection', label: 'Interjections' },
] as const;

const CORE_TYPE_OPTIONS: { value: WordType | null; label: string; chip: string }[] = [
  { value: null, label: 'All', chip: '' },
  { value: 'core', label: 'Core', chip: 'Core only' },
  { value: 'non-core', label: 'Non-Core', chip: 'Non-Core only' },
];

/** Whether the filters were left open, remembered per viewer; storage can be unavailable. */
const EXPANDED_KEY = 'vocabulary-filters-expanded';
function readExpanded(): boolean {
  try {
    return window.localStorage.getItem(EXPANDED_KEY) === 'true';
  } catch {
    return false;
  }
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-roman-red/10 py-1 pl-3 pr-1 text-xs font-medium text-roman-red">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-roman-red/15"
        title="Remove filter"
        aria-label={`Remove filter: ${label}`}>
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

/**
 * The vocabulary viewer's search bar, with the filters folded away under it. While they are folded, the
 * filters in force show as chips under the bar, each removable.
 */
export const VocabularyFiltersComponent: React.FC<VocabularyFiltersProps> = ({
  filters,
  wordTypeCounts,
  countsLoading,
  onFiltersChange,
  onSearch,
  onReset,
}) => {
  const panelId = useId();
  const [expanded, setExpandedState] = useState(readExpanded);
  const setExpanded = (next: boolean) => {
    setExpandedState(next);
    try {
      window.localStorage.setItem(EXPANDED_KEY, String(next));
    } catch {
      // The choice then lasts while the page is open.
    }
  };

  const wordType = WORD_TYPE_OPTIONS.find(option => option.value === filters.wordType);
  const coreType = CORE_TYPE_OPTIONS.find(option => option.value === filters.coreType);
  const activeCount = (filters.wordType !== 'all' ? 1 : 0) + (filters.coreType !== null ? 1 : 0);
  const hasActiveFilters = activeCount > 0 || filters.search !== '';

  return (
    <div className="space-y-2">
      <form
        role="search"
        onSubmit={onSearch}
        className="flex h-11 items-center gap-2 rounded-full bg-white pl-4 pr-1.5 shadow-sm ring-1 ring-gray-200 transition-shadow focus-within:ring-2 focus-within:ring-roman-red/30">
        <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <input
          type="text"
          inputMode="search"
          aria-label="Search words"
          placeholder="Search words…"
          value={filters.search}
          onChange={event => onFiltersChange({ search: event.target.value })}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
        {filters.search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onFiltersChange({ search: '' })}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : 'Filters'}
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors',
            expanded || activeCount > 0
              ? 'bg-roman-red/10 text-roman-red hover:bg-roman-red/15'
              : 'text-gray-600 hover:bg-gray-100'
          )}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filters
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-roman-red px-1.5 text-[11px] font-semibold text-white">
              {activeCount}
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
      </form>

      {expanded ? (
        <div
          id={panelId}
          className="animate-in fade-in slide-in-from-top-1 space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 duration-150 motion-reduce:animate-none">
          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Part of speech</legend>
            <div className="flex flex-wrap gap-1.5">
              {WORD_TYPE_OPTIONS.map(option => {
                const selected = filters.wordType === option.value;
                const count = option.value === 'all' || countsLoading ? undefined : wordTypeCounts[option.value];
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onFiltersChange({ wordType: option.value })}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors',
                      selected ? 'bg-roman-red text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}>
                    {option.label}
                    {count ? (
                      <span className={cn('text-xs tabular-nums', selected ? 'text-white/80' : 'text-gray-400')}>
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Core / Non-Core</legend>
            <div className="inline-flex rounded-full bg-gray-100 p-0.5">
              {CORE_TYPE_OPTIONS.map(option => {
                const selected = filters.coreType === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onFiltersChange({ coreType: option.value })}
                    className={cn(
                      'rounded-full px-3 py-1 text-sm transition-colors',
                      selected ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    )}>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex justify-end border-t border-gray-100 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={!hasActiveFilters}
              className="gap-2 text-gray-600"
              title={hasActiveFilters ? 'Clear the search and every filter' : 'No active filters to reset'}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset Filters
            </Button>
          </div>
        </div>
      ) : (
        activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            {wordType && wordType.value !== 'all' && (
              <FilterChip label={wordType.label} onRemove={() => onFiltersChange({ wordType: 'all' })} />
            )}
            {coreType && coreType.value !== null && (
              <FilterChip label={coreType.chip} onRemove={() => onFiltersChange({ coreType: null })} />
            )}
            <button
              type="button"
              onClick={onReset}
              className="px-1 text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline">
              Reset Filters
            </button>
          </div>
        )
      )}
    </div>
  );
};
