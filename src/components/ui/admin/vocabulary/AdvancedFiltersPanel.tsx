import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import {
  PartOfSpeechSchema,
  NounDeclensionSchema,
  AdjectiveDeclensionSchema,
  type PartOfSpeech,
  type NounDeclension,
  type AdjectiveDeclension,
} from '@/src/types/vocabulary/schemas/enums';
import { VerbConjugationSchema, type VerbConjugation } from '@/src/types/vocabulary/schemas/verb-conjugation';

interface AdvancedFiltersPanelProps {
  filters: {
    partOfSpeech: PartOfSpeech | 'all';
    search: string;
    verbConjugation: VerbConjugation | 'all';
    isDeponent: 'true' | 'false' | 'both';
    nounDeclension: NounDeclension | 'all';
    adjectiveDeclension: AdjectiveDeclension | 'all';
    limit?: number;
  };
  onFiltersChange: (updates: Partial<AdvancedFiltersPanelProps['filters']>) => void;
  onReset: () => void;
  onApply: () => void;
  isLoading?: boolean;
}

const PART_OF_SPEECH_OPTIONS = ['all', ...PartOfSpeechSchema.options] as const;
const VERB_CONJUGATION_OPTIONS = ['all', ...VerbConjugationSchema.options] as const;
const NOUN_DECLENSION_OPTIONS = ['all', ...NounDeclensionSchema.options] as const;
const ADJECTIVE_DECLENSION_OPTIONS = ['all', ...AdjectiveDeclensionSchema.options] as const;

const DEPONENT_OPTIONS = [
  { value: 'both', label: 'Both' },
  { value: 'true', label: 'Deponent' },
  { value: 'false', label: 'Not Deponent' },
] as const;

export const AdvancedFiltersPanel: React.FC<AdvancedFiltersPanelProps> = ({
  filters,
  onFiltersChange,
  onReset,
  onApply,
  isLoading = false,
}) => {
  const handlePartOfSpeechChange = (value: string) => {
    onFiltersChange({
      partOfSpeech: value as PartOfSpeech | 'all',
      verbConjugation: 'all',
      isDeponent: 'both',
      nounDeclension: 'all',
      adjectiveDeclension: 'all',
    });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-serif">Advanced Filters</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="part-of-speech">Part of Speech</Label>
            <Select value={filters.partOfSpeech} onValueChange={handlePartOfSpeechChange}>
              <SelectTrigger id="part-of-speech">
                <SelectValue placeholder="Select part of speech" />
              </SelectTrigger>
              <SelectContent>
                {PART_OF_SPEECH_OPTIONS.map(option => (
                  <SelectItem key={option} value={option}>
                    {option === 'all' ? 'All' : option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="search">Word Search</Label>
            <Input
              id="search"
              type="text"
              placeholder="Search by word..."
              value={filters.search}
              onChange={e => onFiltersChange({ search: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="limit">Limit</Label>
            <Input
              id="limit"
              type="number"
              placeholder="Number of results"
              min={1}
              max={100}
              value={filters.limit || 20}
              onChange={e => onFiltersChange({ limit: parseInt(e.target.value) || 20 })}
            />
          </div>
        </div>

        {filters.partOfSpeech === 'verb' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
            <div className="space-y-2">
              <Label htmlFor="verb-conjugation">Conjugation</Label>
              <Select
                value={filters.verbConjugation}
                onValueChange={value => onFiltersChange({ verbConjugation: value as VerbConjugation | 'all' })}>
                <SelectTrigger id="verb-conjugation">
                  <SelectValue placeholder="Select conjugation" />
                </SelectTrigger>
                <SelectContent>
                  {VERB_CONJUGATION_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option === 'all' ? 'All' : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deponent">Deponent</Label>
              <Select
                value={filters.isDeponent}
                onValueChange={value => onFiltersChange({ isDeponent: value as 'true' | 'false' | 'both' })}>
                <SelectTrigger id="deponent">
                  <SelectValue placeholder="Select deponent option" />
                </SelectTrigger>
                <SelectContent>
                  {DEPONENT_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {filters.partOfSpeech === 'noun' && (
          <div className="pt-2 border-t border-gray-200">
            <div className="space-y-2">
              <Label htmlFor="noun-declension">Declension</Label>
              <Select
                value={filters.nounDeclension}
                onValueChange={value => onFiltersChange({ nounDeclension: value as NounDeclension | 'all' })}>
                <SelectTrigger id="noun-declension">
                  <SelectValue placeholder="Select declension" />
                </SelectTrigger>
                <SelectContent>
                  {NOUN_DECLENSION_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option === 'all' ? 'All' : `Declension ${option}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {filters.partOfSpeech === 'adjective' && (
          <div className="pt-2 border-t border-gray-200">
            <div className="space-y-2">
              <Label htmlFor="adjective-declension">Declension</Label>
              <Select
                value={filters.adjectiveDeclension}
                onValueChange={value => onFiltersChange({ adjectiveDeclension: value as AdjectiveDeclension | 'all' })}>
                <SelectTrigger id="adjective-declension">
                  <SelectValue placeholder="Select declension" />
                </SelectTrigger>
                <SelectContent>
                  {ADJECTIVE_DECLENSION_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option === 'all' ? 'All' : `Declension ${option}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
          <Button onClick={onApply} disabled={isLoading} className="flex-1 bg-roman-red hover:bg-roman-red/90">
            {isLoading ? 'Loading...' : 'Apply Filters'}
          </Button>
          <Button onClick={onReset} variant="ghost" disabled={isLoading}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
