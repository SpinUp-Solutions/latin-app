import React from 'react';
import { MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';
import { GeneratedIntegerField } from './GeneratedIntegerField';

interface GeneratedQuestionCountFieldProps {
  id: string;
  count: number | 'all';
  onChange: (count: number) => void;
}

export const GeneratedQuestionCountField: React.FC<GeneratedQuestionCountFieldProps> = ({ id, count, onChange }) => (
  <GeneratedIntegerField
    id={id}
    label="Number of Questions"
    value={typeof count === 'number' ? count : null}
    max={MAX_GENERATED_WORD_COUNT}
    placeholder={count === 'all' ? 'All eligible words (saved setting)' : 'Number of questions'}
    description={
      count === 'all'
        ? 'This saved exercise uses all eligible words. Enter a number to set its question count.'
        : 'Choose how many words to use from this pool. Words without valid selected forms are skipped; fewer questions appear only when there are not enough eligible words.'
    }
    onCommit={value => {
      if (value !== null) onChange(value);
    }}
  />
);
