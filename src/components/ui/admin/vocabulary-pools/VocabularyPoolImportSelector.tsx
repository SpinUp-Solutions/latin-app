'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Library, Loader2, Search, X } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { useDebounce } from '@/src/hooks/useDebounce';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import { useGetPoolsQuery } from '@/src/store/api/vocabularyPoolApi';
import type { VocabularyPoolSummary } from '@/src/types/vocabulary-pool';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';

interface VocabularyPoolImportSelectorProps {
  selectedPoolIds: string[];
  onSelectionChange: (poolIds: string[]) => void;
  disabled?: boolean;
}

const isUsableSummary = (pool: VocabularyPoolSummary): boolean => {
  const metadata = pool.metadata;
  return Boolean(
    pool.id &&
      typeof pool.name === 'string' &&
      typeof pool.description === 'string' &&
      metadata &&
      Number.isSafeInteger(metadata.wordCount) &&
      metadata.wordCount >= 0 &&
      typeof metadata.isActive === 'boolean' &&
      metadata.createdAt != null &&
      metadata.updatedAt != null &&
      typeof metadata.createdBy === 'string' &&
      typeof metadata.updatedBy === 'string' &&
      Array.isArray(metadata.tags) &&
      metadata.tags.every(tag => typeof tag === 'string') &&
      ['beginner', 'intermediate', 'advanced'].includes(metadata.difficulty)
  );
};

/** Selects complete active or inactive pools while preserving choices across search pages. */
export const VocabularyPoolImportSelector: React.FC<VocabularyPoolImportSelectorProps> = ({
  selectedPoolIds,
  onSelectionChange,
  disabled = false,
}) => {
  const [search, setSearch] = useState('');
  const [cursorState, setCursorState] = useState<{ filterKey: string; cursor: string | null }>({
    filterKey: '',
    cursor: null,
  });
  const [selectedPools, setSelectedPools] = useState<Record<string, VocabularyPoolSummary>>({});
  const debouncedSearch = useDebounce(search, 300);
  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      // Sources may be active or inactive. Archived/deleted pools are absent
      // from the active collection and incomplete records are filtered below.
      isActive: null as boolean | null,
      sortBy: 'name' as const,
      sortOrder: 'asc' as const,
    }),
    [debouncedSearch]
  );
  const filterKey = JSON.stringify(filters);
  // Compute the cursor synchronously from the filter key. The first render
  // after a search change therefore cannot accidentally reuse the old page.
  const lastPoolId = cursorState.filterKey === filterKey ? cursorState.cursor : null;
  const { currentData, isLoading, isFetching, isError, error, refetch } = useGetPoolsQuery({
    filters,
    lastPoolId,
  });
  const data = currentData;
  const pools = useMemo(() => (data?.pools ?? []).filter(isUsableSummary), [data?.pools]);
  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastPoolId !== null;
  const selectedIdSet = useMemo(() => new Set(selectedPoolIds), [selectedPoolIds]);

  useEffect(() => {
    if (cursorState.filterKey !== filterKey) setCursorState({ filterKey, cursor: null });
  }, [cursorState.filterKey, filterKey]);

  useEffect(() => {
    setSelectedPools(current => {
      const next: Record<string, VocabularyPoolSummary> = {};
      selectedPoolIds.forEach(id => {
        if (current[id]) next[id] = current[id];
      });
      if (
        Object.keys(current).length === Object.keys(next).length &&
        Object.keys(next).every(id => current[id] === next[id])
      ) {
        return current;
      }
      return next;
    });
  }, [selectedPoolIds]);

  useEffect(() => {
    setSelectedPools(current => {
      const next = { ...current };
      pools.forEach(pool => {
        if (selectedIdSet.has(pool.id)) next[pool.id] = pool;
      });
      if (Object.keys(next).every(id => next[id] === current[id])) return current;
      return next;
    });
  }, [pools, selectedIdSet]);

  const loadMore = useCallback(() => {
    if (!disabled && data?.lastPoolId && hasMore && !loadingMore) {
      setCursorState({ filterKey, cursor: data.lastPoolId });
    }
  }, [data?.lastPoolId, disabled, filterKey, hasMore, loadingMore]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: loadingMore,
    rootMargin: '200px',
  });

  const togglePool = (pool: VocabularyPoolSummary) => {
    if (disabled) return;
    const nextIds = selectedIdSet.has(pool.id)
      ? selectedPoolIds.filter(id => id !== pool.id)
      : [...selectedPoolIds, pool.id];
    setSelectedPools(current => {
      const next = { ...current };
      if (selectedIdSet.has(pool.id)) delete next[pool.id];
      else next[pool.id] = pool;
      return next;
    });
    onSelectionChange(nextIds);
  };

  const removePool = (poolId: string) => {
    if (disabled) return;
    setSelectedPools(current => {
      const next = { ...current };
      delete next[poolId];
      return next;
    });
    onSelectionChange(selectedPoolIds.filter(id => id !== poolId));
  };

  return (
    <div className="space-y-4" data-testid="vocabulary-pool-import-selector">
      <div className="space-y-1">
        <Label className="text-base font-medium flex items-center gap-2">
          <Library className="h-4 w-4" />
          Add words from pools
        </Label>
        <p className="text-sm text-gray-600">
          Copies words into this new pool. Original pools stay unchanged. Repeated words are included once.
        </p>
      </div>

      {selectedPoolIds.length > 0 && (
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <Label>Selected pools ({selectedPoolIds.length})</Label>
              <span className="text-xs text-gray-500">Words are counted after saving.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedPoolIds.map(poolId => {
                const pool = selectedPools[poolId];
                return (
                  <Badge key={poolId} variant="secondary" className="flex items-center gap-1 max-w-full">
                    <SimpleRichDisplay content={pool?.name || poolId} className="truncate" />
                    <button
                      type="button"
                      aria-label={`Remove ${pool?.name || poolId}`}
                      onClick={() => removePool(poolId)}
                      disabled={disabled}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </RomanCardContent>
        </RomanCard>
      )}

      <RomanCard>
        <RomanCardContent className="p-4 space-y-4">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search pools by name..."
              className="pl-10"
              disabled={disabled}
              aria-label="Search pools to import"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-gray-600">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading pools...
            </div>
          ) : isError ? (
            <div className="text-center py-8 text-red-600">
              <p>{getApiErrorMessage(error, 'Failed to load vocabulary pools')}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
                Retry
              </Button>
            </div>
          ) : pools.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No complete vocabulary pools found.</p>
              {hasMore && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={disabled}
                  className="mt-3">
                  Load more pools
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {pools.map(pool => {
                const selected = selectedIdSet.has(pool.id);
                return (
                  <Card
                    key={pool.id}
                    className={`cursor-pointer transition-colors ${selected ? 'ring-2 ring-roman-red bg-red-50/30' : 'hover:bg-gray-50'}`}
                    onClick={() => togglePool(pool)}>
                    <CardContent className="p-3 flex items-start gap-3">
                      <Checkbox
                        checked={selected}
                        disabled={disabled}
                        aria-label={`Select ${pool.name}`}
                        onCheckedChange={() => togglePool(pool)}
                        onClick={event => event.stopPropagation()}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {selected && <Check className="h-4 w-4 text-roman-red shrink-0" />}
                          <SimpleRichDisplay content={pool.name} className="font-medium truncate" />
                        </div>
                        <SimpleRichDisplay content={pool.description} className="text-sm text-gray-600 line-clamp-2" />
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{pool.metadata.wordCount} words</span>
                          <Badge variant={pool.metadata.isActive ? 'default' : 'secondary'} className="text-xs">
                            {pool.metadata.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {(hasMore || loadingMore) && (
                <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-3">
                  {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-gray-500" />}
                  {hasMore && !loadingMore && (
                    <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={disabled}>
                      Load more pools
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </RomanCardContent>
      </RomanCard>
    </div>
  );
};

export default VocabularyPoolImportSelector;
