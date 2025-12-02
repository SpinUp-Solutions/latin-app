import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Label } from '@/src/components/ui/label';
import { Filter, Search, X, RotateCcw } from 'lucide-react';
import { VocabularyFilters } from '@/src/types/admin-vocabulary';

interface VocabularyFiltersProps {
  filters: VocabularyFilters;
  wordTypeCounts: Record<string, number>;
  countsLoading: boolean;
  onFiltersChange: (filters: Partial<VocabularyFilters>) => void;
  onSearch: (e: React.FormEvent) => void;
  onReset: () => void;
}

const WORD_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'noun', label: 'Nouns' },
  { value: 'verb', label: 'Verbs' },
  { value: 'adjective', label: 'Adjectives' },
  { value: 'adverb', label: 'Adverbs' },
  { value: 'preposition', label: 'Prepositions' },
  { value: 'pronoun', label: 'Pronouns' },
  { value: 'conjunction', label: 'Conjunctions' },
  { value: 'interjection', label: 'Interjections' },
] as const;

export const VocabularyFiltersComponent: React.FC<VocabularyFiltersProps> = ({
  filters,
  wordTypeCounts,
  countsLoading,
  onFiltersChange,
  onSearch,
  onReset,
}) => {
  const hasActiveFilters = filters.wordType !== 'all' || filters.search !== '';

  return (
    <Card className="mb-6 bg-white shadow-sm border-gray-200">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Filter className="h-5 w-5 text-blue-600" />
          Vocabulary Filters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wordType" className="text-sm font-medium text-gray-700">
              Word Type
            </Label>
            <Select value={filters.wordType} onValueChange={value => onFiltersChange({ wordType: value })}>
              <SelectTrigger id="wordType" className="bg-white">
                <SelectValue placeholder="Select word type" />
              </SelectTrigger>
              <SelectContent className="bg-white max-h-60">
                {WORD_TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                    <div className="flex items-center justify-between w-full">
                      <span>{option.label}</span>
                      {option.value !== 'all' && !countsLoading && wordTypeCounts[option.value] && (
                        <span className="ml-2 text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded-full">
                          {wordTypeCounts[option.value]}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search" className="text-sm font-medium text-gray-700">
              Search Words
            </Label>
            <form onSubmit={onSearch} className="flex gap-2">
              <Input
                id="search"
                placeholder="Search words..."
                value={filters.search}
                onChange={e => onFiltersChange({ search: e.target.value })}
                className="flex-1 bg-white"
              />
              <Button type="submit" size="sm" variant="outline" className="px-3" title="Search">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 opacity-0">Actions</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className={`flex items-center gap-2 transition-all w-full ${
                hasActiveFilters
                  ? 'opacity-100 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              disabled={!hasActiveFilters}
              title={hasActiveFilters ? 'Reset all filters' : 'No active filters to reset'}>
              <RotateCcw className="h-4 w-4" />
              Reset Filters
            </Button>
          </div>
        </div>

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">Active filters:</span>
              {filters.wordType !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  Type: {WORD_TYPE_OPTIONS.find(opt => opt.value === filters.wordType)?.label}
                  <button
                    onClick={() => onFiltersChange({ wordType: 'all' })}
                    className="ml-1 hover:bg-blue-200 rounded-full p-0.5"
                    title="Remove filter">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filters.search && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                  Search: &ldquo;{filters.search}&rdquo;
                  <button
                    onClick={() => onFiltersChange({ search: '' })}
                    className="ml-1 hover:bg-green-200 rounded-full p-0.5"
                    title="Remove search">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
