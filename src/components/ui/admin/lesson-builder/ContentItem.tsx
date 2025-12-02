import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Edit, Trash2, Type, Lightbulb, Table, Book, Target, GripVertical, Copy } from 'lucide-react';
import { RenderableContentItem } from '@/src/types/page';
import { SimpleRichDisplay } from '../../core/simple-rich-display';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useClipboard } from '../../core/clipboard';
import { toast } from 'sonner';

interface ContentItemProps {
  item: RenderableContentItem;
  onEdit: () => void;
  onRemove: () => void;
  isDraggable?: boolean;
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

export const ContentItem: React.FC<ContentItemProps> = ({ item, onEdit, onRemove, isDraggable = false }) => {
  const Icon = getContentIcon(item.type);
  const { copyItem } = useClipboard();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleCopy = () => {
    copyItem(item);
    toast.success(`Copied "${item.title || item.type}" to clipboard`);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between bg-gray-50 p-2 rounded border hover:bg-gray-100">
      <div className="flex items-center gap-1.5">
        {isDraggable && (
          <Button
            variant="ghost"
            size="sm"
            className="cursor-grab active:cursor-grabbing p-0.5 h-5 w-5 text-gray-400 hover:text-gray-600"
            {...attributes}
            {...listeners}>
            <GripVertical className="h-3 w-3" />
          </Button>
        )}
        <Icon className="h-3.5 w-3.5 text-gray-600" />
        <span className="text-sm font-medium">
          <SimpleRichDisplay content={item.title || ''} />
        </span>
        <span className="text-xs text-gray-500">({item.type})</span>
      </div>
      <div className="flex gap-0.5">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCopy} title="Copy content">
          <Copy className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
          <Edit className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
