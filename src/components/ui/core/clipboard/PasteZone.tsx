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
  const { pasteBulk, hasItems, selectedItems, clipboardItems } = useClipboard();

  if (!hasItems) {
    return null;
  }

  const hasSelection = selectedItems.length > 0;
  const selectedCount = selectedItems.length;

  // Show selection info or fallback to latest item
  const displayText = hasSelection
    ? `${selectedCount} selected item${selectedCount > 1 ? 's' : ''}`
    : `${clipboardItems.length} item${clipboardItems.length > 1 ? 's' : ''} in clipboard`;

  const handlePaste = () => {
    const indicesToPaste = hasSelection ? selectedItems : [0]; // If no selection, paste latest
    pasteBulk({ pageType, pageIndex }, indicesToPaste);
  };

  return (
    <div
      className={`border-2 border-dashed border-blue-300 rounded-lg p-3 bg-blue-50/50 hover:bg-blue-50 transition-colors ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-blue-700">
          <Clipboard className="h-4 w-4" />
          <span>Paste: {displayText}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePaste}
          className="border-blue-300 text-blue-700 hover:bg-blue-100"
          disabled={!hasSelection && clipboardItems.length === 0}>
          <Plus className="h-4 w-4 mr-1" />
          {hasSelection ? `Paste Selected (${selectedCount})` : 'Paste Latest'}
        </Button>
      </div>
    </div>
  );
};
