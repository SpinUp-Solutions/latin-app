import React, { createContext, useContext, ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RenderableContentItem } from '@/src/types/page';
import { ClipboardSource, ClipboardTarget, ClipboardContextType, PasteResult } from '@/src/types/clipboard';
import {
  copyContentItem,
  pasteContentItem,
  clearClipboard,
  selectClipboardItems,
  selectHasClipboardItems,
} from '@/src/store/slices/clipboardSlice';
import { addContentToPage, loadTooltips } from '@/src/store/slices/lessonSlice';
import { AppDispatch } from '@/src/store';

const ClipboardContext = createContext<ClipboardContextType | undefined>(undefined);

export const useClipboard = () => {
  const context = useContext(ClipboardContext);
  if (!context) {
    throw new Error('useClipboard must be used within a ClipboardProvider');
  }
  return context;
};

interface ClipboardProviderProps {
  children: ReactNode;
}

export const ClipboardProvider: React.FC<ClipboardProviderProps> = ({ children }) => {
  const dispatch = useDispatch<AppDispatch>();
  const clipboardItems = useSelector(selectClipboardItems);
  const hasItems = useSelector(selectHasClipboardItems);

  const copyItem = (content: RenderableContentItem, source?: ClipboardSource) => {
    dispatch(copyContentItem({ content, source }));
  };

  const pasteItem = (target: ClipboardTarget) => {
    const result = dispatch(pasteContentItem(0)) as PasteResult | null;

    if (result && result.content && result.tooltips) {
      dispatch(
        addContentToPage({
          pageType: target.pageType,
          pageIndex: target.pageIndex,
          content: result.content,
        })
      );

      if (Object.keys(result.tooltips).length > 0) {
        dispatch(loadTooltips(result.tooltips));
      }
    }
  };

  const clearItems = () => {
    dispatch(clearClipboard());
  };

  return (
    <ClipboardContext.Provider
      value={{
        copyItem,
        pasteItem,
        hasItems,
        clearItems,
        clipboardItems,
      }}>
      {children}
    </ClipboardContext.Provider>
  );
};
