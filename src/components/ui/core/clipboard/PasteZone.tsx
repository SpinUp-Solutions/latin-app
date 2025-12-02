import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Clipboard, Plus } from 'lucide-react';
import { useClipboard } from './ClipboardProvider';

interface PasteZoneProps {
  pageIndex: number;
  className?: string;
}

export const PasteZone: React.FC<PasteZoneProps> = ({ pageIndex, className = '' }) => {
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
    pasteBulk({ pageIndex }, indicesToPaste);
  };

  return (
    <div
      className={`border-2 border-dashed border-blue-300 rounded p-2 bg-blue-50/50 hover:bg-blue-50 transition-colors ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-blue-700">
          <Clipboard className="h-3 w-3" />
          <span>{displayText}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePaste}
          className="border-blue-300 text-blue-700 hover:bg-blue-100 h-6 text-xs px-2"
          disabled={!hasSelection && clipboardItems.length === 0}>
          <Plus className="h-3 w-3 mr-1" />
          {hasSelection ? `Paste (${selectedCount})` : 'Paste'}
        </Button>
      </div>
    </div>
  );
};
