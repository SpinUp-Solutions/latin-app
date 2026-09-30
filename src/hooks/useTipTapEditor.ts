import { useEditor, Editor } from '@tiptap/react';
import { Extensions } from '@tiptap/core';
import { useEffect } from 'react';

interface TipTapEditorOptions {
  extensions: Extensions;
  initialContent?: string;
  editable?: boolean;
  className?: string;
  onUpdate?: (editor: Editor, html: string) => void;
}

export const useTipTapEditor = ({
  extensions,
  initialContent = '',
  editable = true,
  className = '',
  onUpdate,
}: TipTapEditorOptions) => {
  const editor = useEditor({
    extensions,
    content: initialContent,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onUpdate?.(editor, editor.getHTML()),
    editorProps: { attributes: { class: className } },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent, false);
    }
  }, [editor, initialContent]);

  return editor;
};
