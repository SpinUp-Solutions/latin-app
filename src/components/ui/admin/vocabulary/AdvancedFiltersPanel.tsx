import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Checkbox } from '@/src/components/ui/checkbox';
import { MultiSelect, type MultiSelectOption } from '@/src/components/ui/multi-select';
import {
  PartOfSpeechSchema,
  NounDeclensionSchema,
  AdjectiveDeclensionSchema,
  PronounTypeSchema,
  PronounPersonSchema,
  type PartOfSpeech,
  type NounDeclension,
  type AdjectiveDeclension,
  type PronounType,
  type PronounPerson,
} from '@/shared/types/vocabulary/schemas/enums';
import { VerbConjugationSchema, type VerbConjugation } from '@/shared/types/vocabulary/schemas/verb-conjugation';

interface AdvancedFiltersPanelProps {
  filters: {
    partOfSpeech: PartOfSpeech | 'all';
    search: string;
    verbConjugation: VerbConjugation[] | 'all';
    isDeponent: 'true' | 'false' | 'both';
    nounDeclension: NounDeclension[] | 'all';
    adjectiveDeclension: AdjectiveDeclension[] | 'all';
    pronounType: PronounType[] | 'all';
    pronounPerson: PronounPerson[] | 'all';
    limit?: number | 'all';
  };
  onFiltersChange: (updates: Partial<AdvancedFiltersPanelProps['filters']>) => void;
  onReset: () => void;
  onApply?: () => void;
  isLoading?: boolean;
}

const PART_OF_SPEECH_OPTIONS = ['all', ...PartOfSpeechSchema.options] as const;

const VERB_CONJUGATION_OPTIONS: MultiSelectOption[] = VerbConjugationSchema.options.map(v => ({
  value: v,
  label: v,
}));

const NOUN_DECLENSION_OPTIONS: MultiSelectOption[] = NounDeclensionSchema.options.map(v => ({
  value: v,
  label: `Declension ${v}`,
}));

const ADJECTIVE_DECLENSION_OPTIONS: MultiSelectOption[] = AdjectiveDeclensionSchema.options.map(v => ({
  value: v,
  label: `Declension ${v}`,
}));

const PRONOUN_TYPE_OPTIONS: MultiSelectOption[] = PronounTypeSchema.options.map(v => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));

const PRONOUN_PERSON_OPTIONS: MultiSelectOption[] = PronounPersonSchema.options.map(v => ({
  value: v,
  label: `${v} Person`,
}));

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
  const isAllLimit = filters.limit === 'all';
  const externalLimitValue =
    typeof filters.limit === 'number' && Number.isFinite(filters.limit) ? String(filters.limit) : '';

  const [localLimitValue, setLocalLimitValue] = useState(externalLimitValue);

  useEffect(() => {
    setLocalLimitValue(externalLimitValue);
  }, [externalLimitValue]);

  const handlePartOfSpeechChange = (value: string) => {
    onFiltersChange({
      partOfSpeech: value as PartOfSpeech | 'all',
      verbConjugation: 'all',
      isDeponent: 'both',
      nounDeclension: 'all',
      adjectiveDeclension: 'all',
      pronounType: 'all',
      pronounPerson: 'all',
    });
  };

  const handleLimitBlur = () => {
    if (localLimitValue === '') {
      onFiltersChange({ limit: 5 });
    } else {
      const parsed = parseInt(localLimitValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        onFiltersChange({ limit: parsed });
      } else {
        onFiltersChange({ limit: 5 });
      }
    }
  };

  const isOnlyPersonal =
    filters.pronounType !== 'all' && filters.pronounType.length === 1 && filters.pronounType[0] === 'personal';

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
              placeholder={isAllLimit ? 'Fetching all results' : 'Number of results'}
              min={1}
              max={100}
              value={isAllLimit ? '' : localLimitValue}
              disabled={isAllLimit}
              onChange={e => setLocalLimitValue(e.target.value)}
              onBlur={handleLimitBlur}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="limit-all"
                checked={isAllLimit}
                onCheckedChange={checked => {
                  const nextValue = checked === true ? 'all' : 20;
                  onFiltersChange({ limit: nextValue });
                }}
                disabled={isLoading}
              />
              <Label htmlFor="limit-all" className="text-sm font-normal text-gray-700">
                Fetch all results
              </Label>
            </div>
          </div>
        </div>

        {filters.partOfSpeech === 'verb' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
            <div className="space-y-2">
              <Label>Conjugation</Label>
              <MultiSelect
                options={VERB_CONJUGATION_OPTIONS}
                value={filters.verbConjugation}
                onChange={value => onFiltersChange({ verbConjugation: value as VerbConjugation[] | 'all' })}
                placeholder="All"
              />
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
              <Label>Declension</Label>
              <MultiSelect
                options={NOUN_DECLENSION_OPTIONS}
                value={filters.nounDeclension}
                onChange={value => onFiltersChange({ nounDeclension: value as NounDeclension[] | 'all' })}
                placeholder="All"
              />
            </div>
          </div>
        )}

        {filters.partOfSpeech === 'adjective' && (
          <div className="pt-2 border-t border-gray-200">
            <div className="space-y-2">
              <Label>Declension</Label>
              <MultiSelect
                options={ADJECTIVE_DECLENSION_OPTIONS}
                value={filters.adjectiveDeclension}
                onChange={value => onFiltersChange({ adjectiveDeclension: value as AdjectiveDeclension[] | 'all' })}
                placeholder="All"
              />
            </div>
          </div>
        )}

        {filters.partOfSpeech === 'pronoun' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200">
            <div className="space-y-2">
              <Label>Pronoun Type</Label>
              <MultiSelect
                options={PRONOUN_TYPE_OPTIONS}
                value={filters.pronounType}
                onChange={value => {
                  const newType = value as PronounType[] | 'all';
                  const newIsOnlyPersonal = newType !== 'all' && newType.length === 1 && newType[0] === 'personal';
                  onFiltersChange({
                    pronounType: newType,
                    ...(!newIsOnlyPersonal ? { pronounPerson: 'all' as const } : {}),
                  });
                }}
                placeholder="All"
              />
            </div>

            {isOnlyPersonal && (
              <div className="space-y-2">
                <Label>Person</Label>
                <MultiSelect
                  options={PRONOUN_PERSON_OPTIONS}
                  value={filters.pronounPerson}
                  onChange={value => onFiltersChange({ pronounPerson: value as PronounPerson[] | 'all' })}
                  placeholder="All"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
          {onApply && (
            <Button onClick={onApply} disabled={isLoading} className="flex-1 bg-roman-red hover:bg-roman-red/90">
              {isLoading ? 'Loading...' : 'Apply Filters'}
            </Button>
          )}
          <Button onClick={onReset} variant="ghost" disabled={isLoading} className={onApply ? '' : 'flex-1'}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
