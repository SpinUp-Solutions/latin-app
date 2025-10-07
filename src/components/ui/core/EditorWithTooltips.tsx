import React, { useRef, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';
import { TooltipContainer } from './TooltipContainer';
import { TooltipData } from '@/src/types/tooltip';

interface EditorWithTooltipsProps {
  editor: Editor | null;
  className?: string;
  children?: React.ReactNode; // For toolbars, etc.
  onTooltipShow?: (tooltipData: TooltipData) => void;
  onTooltipHide?: () => void;
}

export const EditorWithTooltips: React.FC<EditorWithTooltipsProps> = ({
  editor,
  className,
  children,
  onTooltipShow,
  onTooltipHide,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: MouseEvent) => {
    // Always pass click events to the editor, regardless of tooltip
    const editorElement = editorRef.current?.querySelector('.ProseMirror');
    if (editorElement && e.target !== editorElement) {
      // Create a new click event and dispatch it to the editor
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        view: window,
      });
      editorElement.dispatchEvent(clickEvent);
    }
  }, []);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <>
      {children}
      <TooltipContainer
        className={`relative [&_[data-tooltip='true']]:cursor-help ${className || ''}`}
        onTooltipShow={onTooltipShow}
        onTooltipHide={onTooltipHide}
        onMouseClick={handleClick}>
        <div ref={editorRef}>
          <EditorContent editor={editor} />
        </div>
      </TooltipContainer>
    </>
  );
};

export default EditorWithTooltips;
