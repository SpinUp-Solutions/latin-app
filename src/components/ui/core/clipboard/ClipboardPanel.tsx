import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { ChevronUp, ChevronDown, Clipboard, Trash2, CheckSquare, Square } from 'lucide-react';
import { useClipboard } from './ClipboardProvider';
import { ClipboardPanelItem } from './ClipboardPanelItem';

interface ClipboardPanelProps {
  onPasteBulk?: (selectedIndices: number[]) => void;
}

export const ClipboardPanel: React.FC<ClipboardPanelProps> = ({ onPasteBulk }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { clipboardItems, hasItems, selectedItems, toggleSelection, selectAll, clearSelection, clearItems } =
    useClipboard();

  if (!hasItems) return null;

  const handlePaste = () => {
    if (onPasteBulk && selectedItems.length > 0) {
      onPasteBulk(selectedItems);
      clearSelection();
    }
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === clipboardItems.length) {
      clearSelection();
    } else {
      selectAll();
    }
  };

  const isAllSelected = selectedItems.length === clipboardItems.length;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
        <div className="flex items-center gap-2">
          <Clipboard className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Clipboard ({clipboardItems.length} items)</span>
        </div>

        <div className="flex items-center gap-1">
          {selectedItems.length > 0 && onPasteBulk && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePaste}
              className="text-blue-600 border-blue-200 hover:bg-blue-50">
              Paste Selected ({selectedItems.length})
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-600 hover:text-gray-800">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white">
          {/* Controls */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
            <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="text-gray-600 hover:text-gray-800">
              {isAllSelected ? <Square className="h-4 w-4 mr-1" /> : <CheckSquare className="h-4 w-4 mr-1" />}
              {isAllSelected ? 'Deselect All' : 'Select All'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={clearItems}
              className="text-red-600 hover:text-red-800 hover:bg-red-50">
              <Trash2 className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>

          {/* Items Grid */}
          <div className="p-4 max-h-60 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {clipboardItems.map((item, index) => (
                <ClipboardPanelItem
                  key={`${item.copiedAt}-${index}`}
                  item={item}
                  index={index}
                  isSelected={selectedItems.includes(index)}
                  onToggle={toggleSelection}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
