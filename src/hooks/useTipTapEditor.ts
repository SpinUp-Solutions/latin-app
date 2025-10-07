import { useEditor, Editor } from '@tiptap/react';
import { Extensions } from '@tiptap/core';
import { useCallback, useEffect } from 'react';

export interface TipTapEditorOptions {
  extensions: Extensions;
  initialContent?: string;
  editable?: boolean;
  className?: string;
  onUpdate?: (editor: Editor, html: string) => void;
  onSelectionUpdate?: (editor: Editor, selectedText: string) => void;
  onEditorReady?: (editor: Editor) => void;
}

export const useTipTapEditor = ({
  extensions,
  initialContent = '',
  editable = true,
  className = '',
  onUpdate,
  onSelectionUpdate,
  onEditorReady,
}: TipTapEditorOptions) => {
  const editor = useEditor({
    extensions,
    content: initialContent,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdate?.(editor, html);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to);
      onSelectionUpdate?.(editor, selectedText);
    },
    editorProps: {
      attributes: {
        class: className,
      },
    },
  });

  // Update editor content when initialContent changes
  useEffect(() => {
    if (editor && initialContent !== undefined) {
      const currentContent = editor.getHTML();
      if (currentContent !== initialContent) {
        editor.commands.setContent(initialContent, false);
      }
    }
  }, [editor, initialContent]);

  // Notify when editor is ready
  useCallback(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady])();

  return editor;
};
