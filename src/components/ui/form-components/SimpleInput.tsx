import React from 'react';
import { Label } from '@/src/components/ui/label';
import { SimpleRichEditor } from '@/src/components/ui/core/simple-rich-editor';

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
      <SimpleRichEditor
        content={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        singleLine={true}
        className="mt-1"
      />
    </div>
  );
};
