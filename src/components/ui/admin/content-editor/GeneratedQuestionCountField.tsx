import React, { useEffect, useState } from 'react';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';

interface GeneratedQuestionCountFieldProps {
  id: string;
  count: number | 'all';
  onChange: (count: number) => void;
}

export const GeneratedQuestionCountField: React.FC<GeneratedQuestionCountFieldProps> = ({ id, count, onChange }) => {
  const numericCount = typeof count === 'number' ? count : null;
  const [inputValue, setInputValue] = useState(numericCount === null ? '' : String(numericCount));

  useEffect(() => {
    if (numericCount === null) {
      setInputValue('');
      return;
    }

    setInputValue(String(numericCount));
  }, [numericCount]);

  const commitInputValue = () => {
    const parsed = Number(inputValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setInputValue(numericCount === null ? '' : String(numericCount));
      return;
    }

    const nextCount = Math.min(parsed, MAX_GENERATED_WORD_COUNT);
    setInputValue(String(nextCount));
    onChange(nextCount);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Number of Questions</Label>
      <Input
        id={id}
        type="number"
        min={1}
        max={MAX_GENERATED_WORD_COUNT}
        inputMode="numeric"
        value={inputValue}
        placeholder={count === 'all' ? 'All eligible words (saved setting)' : 'Number of questions'}
        aria-describedby={`${id}-description`}
        onChange={event => setInputValue(event.target.value)}
        onBlur={commitInputValue}
      />
      <p id={`${id}-description`} className="text-xs text-gray-500">
        {count === 'all'
          ? 'This saved exercise uses all eligible words. Enter a number to set its question count.'
          : 'Choose how many words to use from this pool. Words without valid selected forms are skipped; fewer questions appear only when there are not enough eligible words.'}
      </p>
    </div>
  );
};
