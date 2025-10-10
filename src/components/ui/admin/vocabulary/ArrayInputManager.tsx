import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Label } from '@/src/components/ui/label';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

interface ArrayInputManagerProps {
  label: string;
  items: string[];
  onAdd: () => void;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  inputType?: 'input' | 'textarea';
  required?: boolean;
  emptyMessage?: string;
  placeholder?: (index: number) => string;
}

export const ArrayInputManager: React.FC<ArrayInputManagerProps> = ({
  label,
  items,
  onAdd,
  onUpdate,
  onRemove,
  inputType = 'input',
  required = false,
  emptyMessage = 'No items added yet.',
  placeholder = index => `Item ${index + 1}...`,
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>
          {label} {required && <span className="text-red-500">*</span>}
        </Label>
        <Button onClick={onAdd} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Add {label.replace(/s$/, '')}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-sm text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className={`flex ${inputType === 'textarea' ? 'items-start' : 'items-center'} gap-2`}>
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium ${inputType === 'textarea' ? 'mt-2' : ''}`}>
                {index + 1}
              </div>
              {inputType === 'textarea' ? (
                <Textarea
                  value={item}
                  onChange={e => onUpdate(index, e.target.value)}
                  rows={2}
                  className="flex-1"
                  placeholder={placeholder(index)}
                />
              ) : (
                <Input
                  value={item}
                  onChange={e => onUpdate(index, e.target.value)}
                  className="flex-1"
                  placeholder={placeholder(index)}
                />
              )}
              <Button
                onClick={() => onRemove(index)}
                size="sm"
                variant="ghost"
                className={inputType === 'textarea' ? 'mt-2' : ''}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
