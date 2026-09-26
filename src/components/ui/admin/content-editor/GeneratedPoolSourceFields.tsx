import React from 'react';
import { VocabularyPoolSelector } from '@/src/components/ui/admin/vocabulary-pools/VocabularyPoolSelector';
import { GeneratedQuestionCountField } from './GeneratedQuestionCountField';

interface GeneratedPoolSourceFieldsProps {
  poolId: string | null | undefined;
  count: number | 'all';
  questionCountId: string;
  onPoolChange: (poolId: string | null) => void;
  onCountChange: (count: number) => void;
}

export const GeneratedPoolSourceFields: React.FC<GeneratedPoolSourceFieldsProps> = ({
  poolId,
  count,
  questionCountId,
  onPoolChange,
  onCountChange,
}) => {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium mb-3">Vocabulary Pool</label>
      <VocabularyPoolSelector
        selectedPoolId={poolId || undefined}
        onPoolSelect={nextPoolId => onPoolChange(nextPoolId || null)}
      />

      <GeneratedQuestionCountField id={questionCountId} count={count} onChange={onCountChange} />
    </div>
  );
};
