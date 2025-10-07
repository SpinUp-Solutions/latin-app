import React from 'react';
import { Label } from '@/src/components/ui/label';
import { SimpleRichEditor } from '@/src/components/ui/core/simple-rich-editor';

interface SimpleTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  id?: string;
}

export const SimpleTextarea: React.FC<SimpleTextareaProps> = ({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  id,
}) => {
  const textareaId = id || `textarea-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div>
      <Label htmlFor={textareaId}>{label}</Label>
      <SimpleRichEditor
        content={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="mt-1"
      />
    </div>
  );
};
