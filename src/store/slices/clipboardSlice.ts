import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { regenerateContentAndTooltipIds } from '@/src/utils/idUtils';
import { extractTooltipsFromContentItem } from '@/src/utils/tooltipUtils';
import { ClipboardItem, ClipboardState, CopyContentPayload, PasteResult } from '@/src/types/clipboard';

const initialState: ClipboardState = {
  items: [],
  maxItems: 10,
};

const clipboardSlice = createSlice({
  name: 'clipboard',
  initialState,
  reducers: {
    copyContentItem: (state, action: PayloadAction<CopyContentPayload>) => {
      const { content, source } = action.payload;

      const contentCopy = JSON.parse(JSON.stringify(content));
      const associatedTooltips = extractTooltipsFromContentItem(contentCopy);

      const clipboardItem: ClipboardItem = {
        content: contentCopy,
        associatedTooltips,
        source,
        copiedAt: new Date().toISOString(),
      };

      state.items.unshift(clipboardItem);

      if (state.items.length > state.maxItems) {
        state.items = state.items.slice(0, state.maxItems);
      }
    },

    clearClipboard: state => {
      state.items = [];
    },

    removeClipboardItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
  },
});

export const { copyContentItem, clearClipboard, removeClipboardItem } = clipboardSlice.actions;

export const pasteContentItem = (clipboardIndex: number = 0) => {
  return (dispatch: unknown, getState: () => { clipboard: ClipboardState }) => {
    const state = getState();
    const clipboardItem = state.clipboard.items[clipboardIndex];

    if (!clipboardItem) {
      return null;
    }

    const { content, tooltips } = regenerateContentAndTooltipIds(
      clipboardItem.content,
      clipboardItem.associatedTooltips
    );

    return {
      content,
      tooltips,
      metadata: {
        ...clipboardItem.source,
        copiedAt: clipboardItem.copiedAt,
      },
    } as PasteResult;
  };
};

export const selectClipboardItems = (state: { clipboard: ClipboardState }) => state.clipboard.items;
export const selectHasClipboardItems = (state: { clipboard: ClipboardState }) => state.clipboard.items.length > 0;
export const selectLatestClipboardItem = (state: { clipboard: ClipboardState }) => state.clipboard.items[0] || null;

export default clipboardSlice.reducer;
