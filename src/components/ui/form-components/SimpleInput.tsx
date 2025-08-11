import React from 'react';
import { Label } from '@/src/components/ui/label';
import { Input } from '@/src/components/ui/input';

interface SimpleInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

export const SimpleInput: React.FC<SimpleInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  id,
}) => {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div>
      <Label htmlFor={inputId}>
        {label}
        {required && ' *'}
      </Label>
      <Input
        id={inputId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1"
      />
    </div>
  );
};
