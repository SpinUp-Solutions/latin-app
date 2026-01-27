'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/src/components/ui/input';
import { useSearchWordsQuery } from '@/src/store/api/vocabularyApi';
import { Search, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const MIN_QUERY_LENGTH = 2;

export default function WordSearchPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setDebouncedSearch('');
      return;
    }
    const timeoutId = window.setTimeout(() => setDebouncedSearch(trimmed), 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const trimmedSearch = searchTerm.trim();
  const shouldSearch = debouncedSearch.length >= MIN_QUERY_LENGTH;

  const {
    data: results = [],
    isFetching,
    isError,
  } = useSearchWordsQuery(
    { search: debouncedSearch, limit: 12 },
    {
      skip: !shouldSearch,
    }
  );

  const hasResults = results.length > 0;
  const showHelper = trimmedSearch.length > 0 && trimmedSearch.length < MIN_QUERY_LENGTH;

  const statusText = useMemo(() => {
    if (showHelper) return `Type at least ${MIN_QUERY_LENGTH} characters to search`;
    if (!shouldSearch && !trimmedSearch) return 'Search the full vocabulary list';
    if (isFetching) return 'Searching...';
    if (isError) return 'Search failed. Please try again.';
    if (shouldSearch && !hasResults) return 'No matching words found';
    return '';
  }, [showHelper, shouldSearch, trimmedSearch, isFetching, isError, hasResults]);

  return (
    <div className="px-4 pt-4">
      <div className="rounded-2xl border border-amber-900/30 bg-amber-950/10 backdrop-blur-sm p-4 shadow-md">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-700" />
            <Input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search Latin words..."
              className="pl-9 pr-9 bg-white/90 border-amber-900/30 placeholder:text-amber-700/60 focus-visible:ring-amber-700/60 focus-visible:ring-1"
            />
            {trimmedSearch.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-700 hover:text-amber-900">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {statusText && (
          <p className="mt-3 text-xs text-amber-900/80" aria-live="polite">
            {statusText}
          </p>
        )}

        {hasResults && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-amber-900/30 bg-amber-950/10">
            <ul className="divide-y divide-amber-900/20">
              {results.map(result => (
                <li key={result.id} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-serif text-sm text-roman-red">{result.word}</span>
                    {result.part_of_speech && (
                      <span className="text-[10px] uppercase tracking-wide text-amber-800/80">
                        {result.part_of_speech}
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      'text-xs text-amber-950/80',
                      result.translation ? '' : 'italic text-amber-800/60'
                    )}>
                    {result.translation || 'No translation available'}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
