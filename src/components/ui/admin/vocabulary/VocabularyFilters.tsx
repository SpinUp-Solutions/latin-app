import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Label } from '@/src/components/ui/label';
import { Filter, Search, X } from 'lucide-react';
import { VocabularyFilters } from '@/src/types/admin-vocabulary';

interface VocabularyFiltersProps {
  filters: VocabularyFilters;
  wordTypeCounts: Record<string, number>;
  countsLoading: boolean;
  onFiltersChange: (filters: Partial<VocabularyFilters>) => void;
  onSearch: (e: React.FormEvent) => void;
  onReset: () => void;
}

const wordTypeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'noun', label: 'Nouns' },
  { value: 'verb', label: 'Verbs' },
  { value: 'adjective', label: 'Adjectives' },
  { value: 'adverb', label: 'Adverbs' },
  { value: 'preposition', label: 'Prepositions' },
  { value: 'pronoun', label: 'Pronouns' },
  { value: 'conjunction', label: 'Conjunctions' },
  { value: 'interjection', label: 'Interjections' },
  { value: 'enclitic', label: 'Enclitics' },
  { value: 'number', label: 'Numbers' },
];

const sectionOptions = [
  { value: 'all', label: 'All Sections' },
  { value: 'unit1', label: 'Unit 1' },
  { value: 'unit2', label: 'Unit 2' },
  { value: 'unit3', label: 'Unit 3' },
  { value: 'unit4', label: 'Unit 4' },
  { value: 'unit5', label: 'Unit 5' },
];

export const VocabularyFiltersComponent: React.FC<VocabularyFiltersProps> = ({
  filters,
  wordTypeCounts,
  countsLoading,
  onFiltersChange,
  onSearch,
  onReset,
}) => {
  const hasActiveFilters = filters.wordType !== 'all' || filters.section !== 'all' || filters.search !== '';

  return (
    <Card className="mb-6 bg-white !bg-opacity-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent className="bg-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="wordType">Word Type</Label>
            <Select value={filters.wordType} onValueChange={value => onFiltersChange({ wordType: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select word type" />
              </SelectTrigger>
              <SelectContent className="bg-white !bg-opacity-100">
                {wordTypeOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    {option.value !== 'all' && !countsLoading && wordTypeCounts[option.value] && (
                      <span className="ml-2 text-sm text-muted-foreground">({wordTypeCounts[option.value]})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="section">Section</Label>
            <Select value={filters.section} onValueChange={value => onFiltersChange({ section: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent className="bg-white !bg-opacity-100">
                {sectionOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="search">Search</Label>
            <form onSubmit={onSearch} className="flex gap-2">
              <Input
                id="search"
                placeholder="Search words..."
                value={filters.search}
                onChange={e => onFiltersChange({ search: e.target.value })}
              />
              <Button type="submit" size="sm" variant="outline">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>

          <div className="flex items-end">
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={onReset} className="flex items-center gap-2">
                <X className="h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
