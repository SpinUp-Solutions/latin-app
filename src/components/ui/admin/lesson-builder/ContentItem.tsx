import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Edit, Trash2, Type, Lightbulb, Table, Book, Target } from 'lucide-react';
import { RenderableContentItem } from '@/src/types/page';
import { SimpleRichDisplay } from '../../core/simple-rich-display';

interface ContentItemProps {
  item: RenderableContentItem;
  onEdit: () => void;
  onRemove: () => void;
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

export const ContentItem: React.FC<ContentItemProps> = ({ item, onEdit, onRemove }) => {
  const Icon = getContentIcon(item.type);

  return (
    <div className="flex items-center justify-between bg-gray-50 p-3 rounded">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <span className="font-medium">
          <SimpleRichDisplay content={item.title || ''} />
        </span>
        <span className="text-sm text-gray-500">({item.type})</span>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
