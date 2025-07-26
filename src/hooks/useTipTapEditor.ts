import { useEditor, Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { useCallback } from 'react';

export interface TipTapEditorOptions {
  extensions: Extension[];
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

  // Notify when editor is ready
  useCallback(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady])();

  return editor;
};