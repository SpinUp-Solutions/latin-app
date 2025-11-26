import React, { useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { AdvancedFiltersPanel } from '@/src/components/ui/admin/vocabulary/AdvancedFiltersPanel';
import { useWordSelection } from '@/src/hooks/useWordSelection';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import type { Word } from '@/src/types/admin-vocabulary';

interface WordSelectorProps {
  maxSelection?: number;
  initialSelectedWords?: Word[];
  initialSelectedIds?: string[];
}

export const WordSelector: React.FC<WordSelectorProps> = ({
  maxSelection,
  initialSelectedWords = [],
  initialSelectedIds = [],
}) => {
  const {
    selectedIds,
    selectedWords,
    availableWords,
    filters,
    filtersExpanded,
    hasMore,
    isLoading,
    isFetching,
    addWord,
    addAllVisible,
    removeWord,
    loadMore,
    updateFilters,
    resetFilters,
    initialize,
    toggleFilters,
  } = useWordSelection();

  useEffect(() => {
    if (initialSelectedIds.length > 0 || initialSelectedWords.length > 0) {
      initialize(
        initialSelectedIds.length > 0 ? initialSelectedIds : initialSelectedWords.map(w => w.id),
        initialSelectedWords
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading: isFetching,
    rootMargin: '200px',
  });

  const canAddMore = !maxSelection || selectedIds.length < maxSelection;

  return (
    <div className="space-y-6">
      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Filters</Label>
              <Button variant="ghost" size="sm" onClick={toggleFilters} className="text-gray-600">
                {filtersExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Collapse
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Expand
                  </>
                )}
              </Button>
            </div>

            {filtersExpanded && (
              <AdvancedFiltersPanel
                filters={filters}
                onFiltersChange={updateFilters}
                onReset={resetFilters}
                isLoading={isLoading}
              />
            )}
          </div>
        </RomanCardContent>
      </RomanCard>

      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Filtered Results ({availableWords.length})</Label>
              {availableWords.length > 0 && canAddMore && (
                <Button onClick={addAllVisible} size="sm" variant="outline">
                  Add All Results
                </Button>
              )}
            </div>

            {isLoading && !isFetching ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-roman-red mx-auto mb-2" />
                <p className="text-sm text-gray-600">Loading words...</p>
              </div>
            ) : availableWords.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No words found matching your criteria.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableWords.map(word => (
                    <Card
                      key={word.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => canAddMore && addWord(word)}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{word.word}</div>
                            <div className="text-xs text-gray-600 truncate">{word.translation}</div>
                            <Badge variant="outline" className="text-xs mt-1">
                              {word.wordType}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={e => {
                              e.stopPropagation();
                              if (canAddMore) addWord(word);
                            }}
                            disabled={!canAddMore}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {hasMore && <div ref={sentinelRef} className="h-4" />}
                {isFetching && (
                  <div className="flex justify-center pt-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-roman-red" />
                  </div>
                )}
              </div>
            )}
          </div>
        </RomanCardContent>
      </RomanCard>

      {selectedIds.length > 0 && (
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="space-y-4">
              <Label className="text-base font-medium">Pool Words ({selectedIds.length})</Label>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto">
                {selectedWords.map(word => (
                  <Card key={word.id} className="bg-blue-50 border-blue-200">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{word.word}</div>
                          <div className="text-xs text-gray-600 truncate">{word.translation}</div>
                          <Badge variant="secondary" className="text-xs mt-1">
                            {word.wordType}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeWord(word.id)}
                          className="text-red-600 hover:text-red-700">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </RomanCardContent>
        </RomanCard>
      )}
    </div>
  );
};
