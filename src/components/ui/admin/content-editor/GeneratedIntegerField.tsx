import React, { useEffect, useState } from 'react';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';

interface GeneratedIntegerFieldProps {
  id: string;
  label: string;
  value: number | null;
  max: number;
  placeholder: string;
  description: string;
  disabled?: boolean;
  /** Commit an emptied field as `null` instead of restoring the saved value. */
  allowEmpty?: boolean;
  onCommit: (value: number | null) => void;
}

/** A positive whole-number input that commits on blur, clamped to `max`. */
export const GeneratedIntegerField: React.FC<GeneratedIntegerFieldProps> = ({
  id,
  label,
  value,
  max,
  placeholder,
  description,
  disabled,
  allowEmpty,
  onCommit,
}) => {
  const savedText = value === null ? '' : String(value);
  const [inputValue, setInputValue] = useState(savedText);

  useEffect(() => {
    setInputValue(savedText);
  }, [savedText]);

  const commitInputValue = () => {
    if (allowEmpty && inputValue.trim() === '') {
      onCommit(null);
      return;
    }

    const parsed = Number(inputValue);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setInputValue(savedText);
      return;
    }

    const nextValue = Math.min(parsed, max);
    setInputValue(String(nextValue));
    onCommit(nextValue);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        max={max}
        inputMode="numeric"
        value={inputValue}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={`${id}-description`}
        onChange={event => setInputValue(event.target.value)}
        onBlur={commitInputValue}
      />
      <p id={`${id}-description`} className="text-xs text-gray-500">
        {description}
      </p>
    </div>
  );
};
