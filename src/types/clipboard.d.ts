import { RenderableContentItem } from './page';
import { TooltipData } from './tooltip';

export interface ClipboardSource {
  pageIndex?: number;
  lesson?: string;
}

export interface ClipboardTarget {
  pageIndex: number;
}

export interface ClipboardItem {
  content: RenderableContentItem;
  associatedTooltips: Record<string, TooltipData>;
  source?: ClipboardSource;
  copiedAt: string;
}

export interface ClipboardState {
  items: ClipboardItem[];
  maxItems: number;
}

export interface CopyContentPayload {
  content: RenderableContentItem;
  source?: ClipboardSource;
}

export interface PasteResult {
  content: RenderableContentItem;
  tooltips: Record<string, TooltipData>;
  metadata: ClipboardSource & { copiedAt: string };
}

export interface ClipboardContextType {
  copyItem: (content: RenderableContentItem, source?: ClipboardSource) => void;
  pasteBulk: (target: ClipboardTarget, selectedIndices: number[]) => void;
  hasItems: boolean;
  clearItems: () => void;
  clipboardItems: ClipboardItem[];
  selectedItems: number[];
  toggleSelection: (index: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
}
