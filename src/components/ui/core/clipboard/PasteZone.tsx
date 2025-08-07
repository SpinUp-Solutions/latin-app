import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Clipboard, Plus } from 'lucide-react';
import { PageType } from '@/src/types/clipboard';
import { useClipboard } from './ClipboardProvider';

interface PasteZoneProps {
  pageType: PageType;
  pageIndex: number;
  className?: string;
}

export const PasteZone: React.FC<PasteZoneProps> = ({ pageType, pageIndex, className = '' }) => {
  const { pasteItem, hasItems, clipboardItems } = useClipboard();

  if (!hasItems) {
    return null;
  }

  const latestItem = clipboardItems[0];
  const itemType = latestItem?.content?.type || 'content';
  const itemTitle = latestItem?.content?.title || 'Untitled';

  const handlePaste = () => {
    pasteItem({ pageType, pageIndex });
  };

  return (
    <div
      className={`border-2 border-dashed border-blue-300 rounded-lg p-3 bg-blue-50/50 hover:bg-blue-50 transition-colors ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <Clipboard className="h-4 w-4" />
          <span>
            Paste: {itemTitle} ({itemType})
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePaste}
          className="border-blue-300 text-blue-700 hover:bg-blue-100">
          <Plus className="h-4 w-4 mr-1" />
          Paste
        </Button>
      </div>
    </div>
  );
};
