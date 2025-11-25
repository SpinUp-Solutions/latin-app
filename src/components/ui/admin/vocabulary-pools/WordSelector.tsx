import React, { useState, useMemo } from 'react';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { AdvancedFiltersPanel } from '@/src/components/ui/admin/vocabulary/AdvancedFiltersPanel';
import { useWordFilters } from '@/src/hooks/useWordFilters';
import { useGetWordsForPoolSelectionQuery } from '@/src/store/api/vocabularyPoolApi';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import type { Word } from '@/src/types/admin-vocabulary';

interface WordSelectorProps {
  selectedWordIds: string[];
  onSelectionChange: (wordIds: string[]) => void;
  excludeWordIds?: string[];
  maxSelection?: number;
}

export const WordSelector: React.FC<WordSelectorProps> = ({
  selectedWordIds,
  onSelectionChange,
  excludeWordIds = [],
  maxSelection,
}) => {
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [lastWordId, setLastWordId] = useState<string | null>(null);

  const { filters, debouncedFilters, updateFilters, resetFilters } = useWordFilters();

  const { data, isLoading, isFetching } = useGetWordsForPoolSelectionQuery({
    filters: debouncedFilters,
    limit: 50,
    lastWordId,
  });

  const availableWords = useMemo(() => data?.words || [], [data?.words]);
  const hasMore = data?.hasMore || false;

  const [selectedWordsCache, setSelectedWordsCache] = useState<Map<string, Word>>(new Map());

  const filteredWords = useMemo(
    () => availableWords.filter(word => !excludeWordIds.includes(word.id) && !selectedWordIds.includes(word.id)),
    [availableWords, excludeWordIds, selectedWordIds]
  );

  const selectedWords = useMemo(() => {
    return selectedWordIds.map(id => selectedWordsCache.get(id)).filter((word): word is Word => word !== undefined);
  }, [selectedWordIds, selectedWordsCache]);

  const handleAddWord = (wordId: string) => {
    if (!selectedWordIds.includes(wordId)) {
      const word = availableWords.find(w => w.id === wordId);
      if (word) {
        setSelectedWordsCache(prev => new Map(prev).set(wordId, word));
      }
      onSelectionChange([...selectedWordIds, wordId]);
    }
  };

  const handleAddAllWords = () => {
    const newWords = filteredWords.filter(w => !selectedWordIds.includes(w.id));
    if (newWords.length > 0) {
      setSelectedWordsCache(prev => {
        const next = new Map(prev);
        newWords.forEach(word => next.set(word.id, word));
        return next;
      });
      onSelectionChange([...selectedWordIds, ...newWords.map(w => w.id)]);
    }
  };

  const handleRemoveWord = (wordId: string) => {
    setSelectedWordsCache(prev => {
      const next = new Map(prev);
      next.delete(wordId);
      return next;
    });
    onSelectionChange(selectedWordIds.filter(id => id !== wordId));
  };

  const handleLoadMore = () => {
    if (data?.lastWordId && !isFetching) {
      setLastWordId(data.lastWordId);
    }
  };

  const handleApplyFilters = () => {
    setLastWordId(null);
  };

  const handleResetFilters = () => {
    resetFilters();
    setLastWordId(null);
  };

  const sentinelRef = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    hasMore,
    loading: isFetching,
    rootMargin: '200px',
  });

  return (
    <div className="space-y-6">
      <RomanCard>
        <RomanCardContent className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Filters</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="text-gray-600">
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
                onReset={handleResetFilters}
                onApply={handleApplyFilters}
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
              <Label className="text-base font-medium">Filtered Results ({filteredWords.length})</Label>
              {filteredWords.length > 0 && (
                <Button onClick={handleAddAllWords} size="sm" variant="outline">
                  Add All Results
                </Button>
              )}
            </div>

            {isLoading && !isFetching && lastWordId === null ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-roman-red mx-auto mb-2" />
                <p className="text-sm text-gray-600">Loading words...</p>
              </div>
            ) : filteredWords.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No words found matching your criteria.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredWords.map(word => (
                    <Card
                      key={word.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleAddWord(word.id)}>
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
                              handleAddWord(word.id);
                            }}
                            disabled={maxSelection ? selectedWordIds.length >= maxSelection : false}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {hasMore && <div ref={sentinelRef} className="h-4" />}
                {isFetching && lastWordId && (
                  <div className="flex justify-center pt-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-roman-red" />
                  </div>
                )}
              </div>
            )}
          </div>
        </RomanCardContent>
      </RomanCard>

      {selectedWordIds.length > 0 && (
        <RomanCard>
          <RomanCardContent className="p-4">
            <div className="space-y-4">
              <Label className="text-base font-medium">Pool Words ({selectedWordIds.length})</Label>

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
                          onClick={() => handleRemoveWord(word.id)}
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
