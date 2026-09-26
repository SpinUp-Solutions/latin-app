import React, { useEffect, useState } from 'react';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';

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
}) => {
  const savedValue = uniqueWordCount ?? null;
  const [inputValue, setInputValue] = useState(savedValue === null ? '' : String(savedValue));
  const isAvailable = count !== 'all';

  useEffect(() => {
    setInputValue(savedValue === null ? '' : String(savedValue));
  }, [savedValue]);

  const commitInputValue = () => {
    if (inputValue.trim() === '') {
      if (savedValue !== null) onChange(null);
      return;
    }

    const parsed = Number(inputValue);
    if (!Number.isInteger(parsed) || parsed < 1 || !isAvailable) {
      setInputValue(savedValue === null ? '' : String(savedValue));
      return;
    }

    const nextValue = Math.min(parsed, count);
    setInputValue(String(nextValue));
    if (nextValue !== savedValue) onChange(nextValue);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Unique Words</Label>
      <Input
        id={id}
        type="number"
        min={1}
        max={isAvailable ? count : undefined}
        inputMode="numeric"
        value={inputValue}
        disabled={!isAvailable}
        placeholder="A different word for each question"
        aria-describedby={`${id}-description`}
        onChange={event => setInputValue(event.target.value)}
        onBlur={commitInputValue}
      />
      <p id={`${id}-description`} className="text-xs text-gray-500">
        {isAvailable
          ? 'Optional. Use only this many different words and repeat them with different forms until the question count is reached. Leave blank to use a different word for each question.'
          : 'Set a number of questions to limit how many different words are used.'}
      </p>
    </div>
  );
};
