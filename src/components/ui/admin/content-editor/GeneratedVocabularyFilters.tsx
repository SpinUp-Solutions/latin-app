import React from 'react';
import { AdvancedFiltersPanel } from '../vocabulary/AdvancedFiltersPanel';
import type { GeneratorFilters } from '@/src/types/exercises/base';
import type { PartOfSpeech, PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import { parseMultiFilterValue, serializeMultiFilterValue } from '@/src/utils/wordFilters';

interface GeneratedVocabularyFiltersProps {
  derivedFilters: GeneratorFilters;
  count: number | 'all';
  onCountChange: (count: number | 'all') => void;
  onFiltersChange: (updates: Partial<GeneratorFilters>) => void;
  onReset: () => void;
  onApply: () => void;
  isLoading: boolean;
  limitMode: 'exclusive' | 'combined';
}

function serializeFilterUpdates(updates: object): Partial<GeneratorFilters> {
  const serialized: Partial<GeneratorFilters> = {};

  for (const [key, value] of Object.entries(updates)) {
    const filterKey = key as keyof GeneratorFilters;
    if (Array.isArray(value)) {
      serialized[filterKey] = serializeMultiFilterValue(value) ?? 'all';
    } else {
      serialized[filterKey] = value as string;
    }
  }

  return serialized;
}

export const GeneratedVocabularyFilters: React.FC<GeneratedVocabularyFiltersProps> = ({
  derivedFilters,
  count,
  onCountChange,
  onFiltersChange,
  onReset,
  onApply,
  isLoading,
  limitMode,
}) => {
  return (
    <div>
      <label className="block text-sm font-medium mb-3">Vocabulary Filters</label>
      <AdvancedFiltersPanel
        filters={{
          partOfSpeech: (derivedFilters.partOfSpeech || 'all') as PartOfSpeech | 'all',
          search: derivedFilters.search || '',
          verbConjugation: parseMultiFilterValue(derivedFilters.verbConjugation) as
            | ('1' | '2' | '3' | '3io' | '4' | 'irregular')[]
            | 'all',
          isDeponent: (derivedFilters.isDeponent || 'both') as 'true' | 'false' | 'both',
          nounDeclension: parseMultiFilterValue(derivedFilters.nounDeclension) as
            | ('1' | '2' | '3' | '3-istem' | '4' | '5')[]
            | 'all',
          adjectiveDeclension: parseMultiFilterValue(derivedFilters.adjectiveDeclension) as ('1-2' | '3')[] | 'all',
          pronounType: parseMultiFilterValue(derivedFilters.pronounType) as PronounType[] | 'all',
          pronounPerson: parseMultiFilterValue(derivedFilters.pronounPerson) as PronounPerson[] | 'all',
          limit: count,
        }}
        onFiltersChange={updates => {
          if (limitMode === 'exclusive' && 'limit' in updates) {
            const nextCount = updates.limit === undefined ? count : updates.limit;
            onCountChange(nextCount);
            return;
          }

          const { limit, ...filterUpdates } = updates;
          if (limit !== undefined) {
            onCountChange(limit);
          }
          if (Object.keys(filterUpdates).length > 0) {
            onFiltersChange(serializeFilterUpdates(filterUpdates));
          }
        }}
        onReset={onReset}
        onApply={onApply}
        isLoading={isLoading}
      />
    </div>
  );
};
