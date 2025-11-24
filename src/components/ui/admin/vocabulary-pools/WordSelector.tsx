import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Card, CardContent } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { AdvancedFiltersPanel } from '@/src/components/ui/admin/vocabulary/AdvancedFiltersPanel';
import { useGetAdvancedWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import type { PartOfSpeech, NounDeclension, AdjectiveDeclension } from '@/src/types/vocabulary/schemas/enums';
import type { VerbConjugation } from '@/src/types/vocabulary/schemas/verb-conjugation';

interface WordSelectorProps {
  selectedWordIds: string[];
  onSelectionChange: (wordIds: string[]) => void;
}

export const WordSelector: React.FC<WordSelectorProps> = ({ selectedWordIds, onSelectionChange }) => {
  const [filters, setFilters] = useState({
    partOfSpeech: 'all' as PartOfSpeech | 'all',
    search: '',
    verbConjugation: 'all' as VerbConjugation | 'all',
    isDeponent: 'both' as 'true' | 'false' | 'both',
    nounDeclension: 'all' as NounDeclension | 'all',
    adjectiveDeclension: 'all' as AdjectiveDeclension | 'all',
    limit: 50 as number | 'all',
  });

  const [appliedFilters, setAppliedFilters] = useState(filters);

  const { data, isLoading, isFetching } = useGetAdvancedWordsQuery({
    partOfSpeech: appliedFilters.partOfSpeech !== 'all' ? appliedFilters.partOfSpeech : undefined,
    search: appliedFilters.search || undefined,
    verbConjugation: appliedFilters.verbConjugation !== 'all' ? appliedFilters.verbConjugation : undefined,
    isDeponent: appliedFilters.isDeponent !== 'both' ? appliedFilters.isDeponent : undefined,
    nounDeclension: appliedFilters.nounDeclension !== 'all' ? appliedFilters.nounDeclension : undefined,
    adjectiveDeclension: appliedFilters.adjectiveDeclension !== 'all' ? appliedFilters.adjectiveDeclension : undefined,
    limit: typeof appliedFilters.limit === 'number' ? appliedFilters.limit : undefined,
    fetchAll: appliedFilters.limit === 'all',
  });

  const availableWords = data?.words || [];
  const filteredWords = availableWords.filter(word => !selectedWordIds.includes(word.id));

  const handleFiltersChange = (updates: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  };

  const handleReset = () => {
    const defaultFilters = {
      partOfSpeech: 'all' as PartOfSpeech | 'all',
      search: '',
      verbConjugation: 'all' as VerbConjugation | 'all',
      isDeponent: 'both' as 'true' | 'false' | 'both',
      nounDeclension: 'all' as NounDeclension | 'all',
      adjectiveDeclension: 'all' as AdjectiveDeclension | 'all',
      limit: 50 as number | 'all',
    };
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const handleApply = () => {
    setAppliedFilters(filters);
  };

  const handleAddWord = (wordId: string) => {
    if (!selectedWordIds.includes(wordId)) {
      onSelectionChange([...selectedWordIds, wordId]);
    }
  };

  const handleAddAllWords = () => {
    const newWordIds = filteredWords.map(w => w.id).filter(id => !selectedWordIds.includes(id));
    onSelectionChange([...selectedWordIds, ...newWordIds]);
  };

  const handleRemoveWord = (wordId: string) => {
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
      <AdvancedFiltersPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onReset={handleReset}
        onApply={handleApply}
        isLoading={isLoading || isFetching}
      />

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

            {isLoading || isFetching ? (
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
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Word</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Translation</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Type</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredWords.map(word => (
                      <tr key={word.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">{word.word}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {word.definitions ? word.definitions.join(', ') : ''}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant="outline">{word.part_of_speech}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <Button size="sm" variant="ghost" onClick={() => handleAddWord(word.id)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                {availableWords
                  .filter(word => selectedWordIds.includes(word.id))
                  .map(word => (
                    <Card key={word.id} className="bg-blue-50 border-blue-200">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{word.word}</div>
                            <div className="text-xs text-gray-600 truncate">
                              {word.definitions ? word.definitions.join(', ') : ''}
                            </div>
                            <Badge variant="secondary" className="text-xs mt-1">
                              {word.part_of_speech}
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
