import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { SimpleRichEditor } from '../../core/simple-rich-editor';

interface TableFootnotesEditorProps {
  footnotes: string[] | undefined;
  onChange: (footnotes: string[]) => void;
  addButton: 'text' | 'outline';
}

export const TableFootnotesEditor: React.FC<TableFootnotesEditorProps> = ({ footnotes, onChange, addButton }) => {
  const items = footnotes || [];

  return (
    <div>
      <label className="block text-sm font-medium mb-2">Footnotes</label>
      <div className="space-y-2">
        {items.map((footnote, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className="text-sm text-gray-500 pt-2 min-w-[20px]">{index + 1}.</span>
            <SimpleRichEditor
              content={footnote}
              onChange={value => onChange(items.map((item, itemIndex) => (itemIndex === index ? value : item)))}
              className="flex-1 text-sm"
              placeholder="Enter footnote text..."
              rows={2}
            />
            <button
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              className="mt-1 text-red-500 hover:text-red-700 transition-colors"
              title="Remove footnote">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {addButton === 'outline' ? (
          <Button onClick={() => onChange([...items, ''])} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Footnote
          </Button>
        ) : (
          <button
            onClick={() => onChange([...items, ''])}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors">
            <Plus className="h-4 w-4" />
            Add Footnote
          </button>
        )}
      </div>
    </div>
  );
};
