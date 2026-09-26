import React from 'react';
import { VocabularyPoolSelector } from '@/src/components/ui/admin/vocabulary-pools/VocabularyPoolSelector';
import { GeneratedQuestionCountField } from './GeneratedQuestionCountField';
import { GeneratedUniqueWordCountField } from './GeneratedUniqueWordCountField';

interface GeneratedPoolSourceFieldsProps {
  poolId: string | null | undefined;
  count: number | 'all';
  questionCountId: string;
  onPoolChange: (poolId: string | null) => void;
  onCountChange: (count: number) => void;
  /** Omit to hide the unique-word setting (it only applies to form identification). */
  uniqueWords?: {
    id: string;
    value: number | null | undefined;
    onChange: (uniqueWordCount: number | null) => void;
  };
}

export const GeneratedPoolSourceFields: React.FC<GeneratedPoolSourceFieldsProps> = ({
  poolId,
  count,
  questionCountId,
  onPoolChange,
  onCountChange,
  uniqueWords,
}) => {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium mb-3">Vocabulary Pool</label>
      <VocabularyPoolSelector
        selectedPoolId={poolId || undefined}
        onPoolSelect={nextPoolId => onPoolChange(nextPoolId || null)}
      />

      <GeneratedQuestionCountField id={questionCountId} count={count} onChange={onCountChange} />

      {uniqueWords && (
        <GeneratedUniqueWordCountField
          id={uniqueWords.id}
          uniqueWordCount={uniqueWords.value}
          count={count}
          onChange={uniqueWords.onChange}
        />
      )}
    </div>
  );
};
