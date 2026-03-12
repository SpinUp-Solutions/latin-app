import { useMemo } from 'react';
import { Editor } from '@tiptap/react';
import { Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, List, MessageSquare, Link } from 'lucide-react';
import { ToolbarConfig, useToolbarFactory } from '@/src/components/ui/core/toolbar-factory';

interface UseToolbarConfigProps {
  type: 'rich-text';
  editor: Editor | null;
  onAddTooltip?: () => void;
  onAddHyperlink?: () => void;
  disabled?: boolean;
}

export const useToolbarConfig = ({
  type,
  editor,
  onAddTooltip,
  onAddHyperlink,
  disabled = false,
}: UseToolbarConfigProps): ToolbarConfig | null => {
  const { createButton, createSection, createConfig } = useToolbarFactory();

  return useMemo(() => {
    if (!editor) return null;

    if (type === 'rich-text') {
      return createConfig(
        [
          createSection('Format', [
            createButton('bold', Bold, 'Bold', {
              action: () => editor.chain().focus().toggleBold().run(),
            }),
            createButton('italic', Italic, 'Italic', {
              action: () => editor.chain().focus().toggleItalic().run(),
            }),
            createButton('strike', Strikethrough, 'Strikethrough', {
              action: () => editor.chain().focus().toggleStrike().run(),
            }),
          ]),
          createSection('Headings', [
            createButton('heading1', Heading1, 'Heading 1', {
              isActive: editor.isActive('heading', { level: 1 }),
              action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
            }),
            createButton('heading2', Heading2, 'Heading 2', {
              isActive: editor.isActive('heading', { level: 2 }),
              action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            }),
            createButton('heading3', Heading3, 'Heading 3', {
              isActive: editor.isActive('heading', { level: 3 }),
              action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
            }),
          ]),
          createSection('Lists', [
            createButton('bulletList', List, 'Bullet List', {
              action: () => editor.chain().focus().toggleBulletList().run(),
            }),
          ]),
          createSection('Tools', [
            createButton('tooltip', MessageSquare, 'Add Tooltip', {
              action: onAddTooltip,
            }),
            createButton('hyperlink', Link, 'Add Link', {
              action: onAddHyperlink,
            }),
          ]),
        ],
        { disabled }
      );
    }

    return null;
  }, [type, editor, onAddTooltip, onAddHyperlink, disabled, createButton, createSection, createConfig]);
};
