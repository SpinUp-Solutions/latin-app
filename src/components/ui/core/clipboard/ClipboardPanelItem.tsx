import React from 'react';
import { Type, Lightbulb, Table, Book, Target } from 'lucide-react';
import { ClipboardItem } from '@/src/types/clipboard';
import { SimpleRichDisplay } from '../simple-rich-display';
import { getContentTypeLabel } from '@/src/lib/content/registry';

interface ClipboardPanelItemProps {
  item: ClipboardItem;
  index: number;
  isSelected: boolean;
  onToggle: (index: number) => void;
}

const getContentIcon = (type: string) => {
  switch (type) {
    case 'text':
      return Type;
    case 'emphasis':
      return Lightbulb;
    case 'table':
      return Table;
    case 'vocabulary':
      return Book;
    default:
      return Target;
  }
};

export const ClipboardPanelItem: React.FC<ClipboardPanelItemProps> = ({ item, index, isSelected, onToggle }) => {
  const Icon = getContentIcon(item.content.type);
  const title = item.content.title || 'Untitled';
  const typeLabel = getContentTypeLabel(item.content.type);
  const copiedTime = new Date(item.copiedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded border transition-colors ${
        isSelected ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
      }`}>
      <div
        className={`w-5 h-5 rounded border-2 cursor-pointer flex items-center justify-center transition-colors ${
          isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'
        }`}
        onClick={() => onToggle(index)}>
        {isSelected && (
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
      <Icon className="h-3 w-3 text-gray-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          <SimpleRichDisplay content={title} />
        </div>
        <div className="text-xs text-gray-500">
          {typeLabel} • {copiedTime}
          {item.source?.lesson && ` • from ${item.source.lesson}`}
        </div>
      </div>
    </div>
  );
};
