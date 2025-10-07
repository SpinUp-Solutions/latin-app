import { RenderableContentItem } from './page';
import { TooltipData } from './tooltip';

/**
 * Core clipboard types for content copying and pasting system
 */

// Unified location interface for clipboard operations
export interface ClipboardLocation {
  pageIndex: number;
  lesson?: string;
}

// Source location (optional fields for copying)
export interface ClipboardSource extends Partial<ClipboardLocation> {}

// Target location (required fields for pasting)
export interface ClipboardTarget extends Required<Omit<ClipboardLocation, 'lesson'>> {}

// Individual clipboard item with metadata
export interface ClipboardItem {
  content: RenderableContentItem;
  associatedTooltips: Record<string, TooltipData>;
  source?: ClipboardSource;
  copiedAt: string;
}

// Redux clipboard state
export interface ClipboardState {
  items: ClipboardItem[];
  maxItems: number;
}

// Copy action payload
export interface CopyContentPayload {
  content: RenderableContentItem;
  source?: ClipboardSource;
}

// Paste result with regenerated content
export interface PasteResult {
  content: RenderableContentItem;
  tooltips: Record<string, TooltipData>;
  metadata: ClipboardSource & { copiedAt: string };
}

// Context type for React provider
export interface ClipboardContextType {
  copyItem: (content: RenderableContentItem, source?: ClipboardSource) => void;
  pasteItem: (target: ClipboardTarget) => void;
  pasteBulk: (target: ClipboardTarget, selectedIndices: number[]) => void;
  hasItems: boolean;
  clearItems: () => void;
  clipboardItems: ClipboardItem[];
  selectedItems: number[];
  toggleSelection: (index: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
}
