import React from 'react';
import { Input } from '@/src/components/ui/input';
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';
import { GeneratedQuestionCountField } from './GeneratedQuestionCountField';

interface GeneratedPoolSourceFieldsProps {
  poolId: string | null | undefined;
  count: number | 'all';
  poolWordLimit: number | null | undefined;
  questionCountId: string;
  poolWordLimitId: string;
  onPoolChange: (poolId: string | null) => void;
  onCountChange: (count: number | 'all') => void;
  onPoolWordLimitChange: (poolWordLimit: number | null) => void;
}

export const GeneratedPoolSourceFields: React.FC<GeneratedPoolSourceFieldsProps> = ({
  poolId,
  count,
  poolWordLimit,
  questionCountId,
  poolWordLimitId,
  onPoolChange,
  onCountChange,
  onPoolWordLimitChange,
}) => {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium mb-3">Vocabulary Pool</label>
      <VocabularyPoolSelector
        selectedPoolId={poolId || undefined}
        onPoolSelect={nextPoolId => onPoolChange(nextPoolId || null)}
      />

      <GeneratedQuestionCountField id={questionCountId} count={count} onChange={onCountChange} />

      <div className="space-y-2">
        <label htmlFor={poolWordLimitId} className="block text-sm font-medium">
          Pool Word Limit
        </label>
        <Input
          id={poolWordLimitId}
          type="number"
          min={1}
          inputMode="numeric"
          value={poolWordLimit ?? ''}
          onChange={event => {
            const { value } = event.target;
            if (value === '') {
              onPoolWordLimitChange(null);
              return;
            }

            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              onPoolWordLimitChange(parsed);
            }
          }}
          placeholder="Leave blank to use the full pool"
        />
        <p className="text-xs text-gray-500">
          Randomly sample up to this many unique words from the selected pool. Leave blank to use the full pool.
        </p>
      </div>
    </div>
  );
};
