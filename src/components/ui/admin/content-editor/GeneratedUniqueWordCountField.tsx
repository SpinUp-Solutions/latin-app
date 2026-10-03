import React from 'react';
import { MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';
import { GeneratedIntegerField } from './GeneratedIntegerField';

interface GeneratedUniqueWordCountFieldProps {
  id: string;
  uniqueWordCount: number | null | undefined;
  count: number | 'all';
  onChange: (uniqueWordCount: number | null) => void;
}

export const GeneratedUniqueWordCountField: React.FC<GeneratedUniqueWordCountFieldProps> = ({
  id,
  uniqueWordCount,
  count,
  onChange,
}) => (
  <GeneratedIntegerField
    id={id}
    label="Unique Words"
    value={uniqueWordCount ?? null}
    max={count === 'all' ? MAX_GENERATED_WORD_COUNT : count}
    disabled={count === 'all'}
    allowEmpty
    placeholder="A different word for each question"
    description={
      count === 'all'
        ? 'Set a number of questions to limit how many different words are used.'
        : 'Optional. Use only this many different words and repeat them with different forms until the question count is reached. Leave blank to use a different word for each question.'
    }
    onCommit={onChange}
  />
);
