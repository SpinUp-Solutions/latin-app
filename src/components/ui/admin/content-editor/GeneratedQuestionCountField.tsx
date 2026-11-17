import React from 'react';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Label } from '@/src/components/ui/label';
import { MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';
import { DEFAULT_GENERATOR_CONFIG } from '@/src/utils/exercises/generatorConfigDefaults';
import { GeneratedIntegerField } from './GeneratedIntegerField';

interface GeneratedQuestionCountFieldProps {
  id: string;
  count: number | 'all';
  onChange: (count: number | 'all') => void;
}

export const GeneratedQuestionCountField: React.FC<GeneratedQuestionCountFieldProps> = ({ id, count, onChange }) => {
  const useAllWords = count === 'all';

  return (
    <div className="space-y-2">
      <GeneratedIntegerField
        id={id}
        label="Number of Questions"
        value={typeof count === 'number' ? count : null}
        max={MAX_GENERATED_WORD_COUNT}
        placeholder={useAllWords ? 'Every eligible word in the pool' : 'Number of questions'}
        description={
          useAllWords
            ? 'Every word in this pool with a valid selected form becomes a question. Enter a number to use only that many.'
            : 'Choose how many words to use from this pool. Words without valid selected forms are skipped; fewer questions appear only when there are not enough eligible words.'
        }
        onCommit={value => {
          if (value !== null) onChange(value);
        }}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-all`}
          checked={useAllWords}
          onCheckedChange={checked => onChange(checked === true ? 'all' : DEFAULT_GENERATOR_CONFIG.count)}
        />
        <Label htmlFor={`${id}-all`} className="text-sm font-normal text-gray-700">
          Use every eligible word in the pool
        </Label>
      </div>
    </div>
  );
};
