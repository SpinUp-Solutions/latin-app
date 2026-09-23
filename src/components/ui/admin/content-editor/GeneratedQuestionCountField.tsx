import React, { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@/src/components/ui/checkbox';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';

const DEFAULT_GENERATED_QUESTION_COUNT = 5;

interface GeneratedQuestionCountFieldProps {
  id: string;
  count: number | 'all';
  onChange: (count: number | 'all') => void;
}

export const GeneratedQuestionCountField: React.FC<GeneratedQuestionCountFieldProps> = ({ id, count, onChange }) => {
  const numericCount = typeof count === 'number' ? count : null;
  const [inputValue, setInputValue] = useState(numericCount === null ? '' : String(numericCount));
  const lastNumericCount = useRef(numericCount ?? DEFAULT_GENERATED_QUESTION_COUNT);
  const useAllWords = count === 'all';

  useEffect(() => {
    if (numericCount === null) {
      setInputValue('');
      return;
    }

    lastNumericCount.current = numericCount;
    setInputValue(String(numericCount));
  }, [numericCount]);

  const commitInputValue = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setInputValue(String(lastNumericCount.current));
      return;
    }

    const nextCount = Math.min(parsed, MAX_GENERATED_WORD_COUNT);
    lastNumericCount.current = nextCount;
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
        disabled={useAllWords}
        placeholder={useAllWords ? 'Using all eligible words' : 'Number of questions'}
        onChange={event => setInputValue(event.target.value)}
        onBlur={commitInputValue}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-all`}
          checked={useAllWords}
          onCheckedChange={checked => onChange(checked === true ? 'all' : lastNumericCount.current)}
        />
        <Label htmlFor={`${id}-all`} className="text-sm font-normal text-gray-700">
          Use all eligible pool words
        </Label>
      </div>
      <p className="text-xs text-gray-500">
        Controls how many unique words become questions. Choose all to follow the full pool as it changes.
      </p>
    </div>
  );
};
