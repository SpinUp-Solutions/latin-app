import React from 'react';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import type { WordType } from '@/shared/types/vocabulary/schemas/enums';

interface CoreTypeSelectProps {
  id: string;
  /** Null or undefined shows both core and non-core words. */
  value: WordType | null | undefined;
  onChange: (value: WordType | null) => void;
}

export const CoreTypeSelect: React.FC<CoreTypeSelectProps> = ({ id, value, onChange }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>Core / Non-Core</Label>
    <Select value={value ?? 'all'} onValueChange={next => onChange(next === 'all' ? null : (next as WordType))}>
      <SelectTrigger id={id} className="w-full bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Core and Non-Core</SelectItem>
        <SelectItem value="core">Core only</SelectItem>
        <SelectItem value="non-core">Non-Core only</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
