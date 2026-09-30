import { Editor } from '@tiptap/react';
import { Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, List, MessageSquare, Link } from 'lucide-react';
import { ToolbarSection } from '@/src/components/ui/core/toolbar-factory';

interface UseToolbarConfigProps {
  editor: Editor | null;
  onAddTooltip: () => void;
  onAddHyperlink: () => void;
}

export const useToolbarConfig = ({
  editor,
  onAddTooltip,
  onAddHyperlink,
}: UseToolbarConfigProps): ToolbarSection[] | null => {
  'use no memo';
  // Rebuilt on every render: `editor` is one mutable instance, so the toolbar must re-read its
  // active marks and headings whenever an editor transaction re-renders the parent.
  if (!editor) return null;

  return [
    {
      title: 'Format',
      items: [
        { type: 'bold', icon: Bold, title: 'Bold', action: () => editor.chain().focus().toggleBold().run() },
        { type: 'italic', icon: Italic, title: 'Italic', action: () => editor.chain().focus().toggleItalic().run() },
        {
          type: 'strike',
          icon: Strikethrough,
          title: 'Strikethrough',
          action: () => editor.chain().focus().toggleStrike().run(),
        },
      ],
    },
    {
      title: 'Headings',
      items: (
        [
          [1, Heading1],
          [2, Heading2],
          [3, Heading3],
        ] as const
      ).map(([level, icon]) => ({
        type: `heading${level}`,
        icon,
        title: `Heading ${level}`,
        isActive: editor.isActive('heading', { level }),
        action: () => editor.chain().focus().toggleHeading({ level }).run(),
      })),
    },
    {
      title: 'Lists',
      items: [
        {
          type: 'bulletList',
          icon: List,
          title: 'Bullet List',
          action: () => editor.chain().focus().toggleBulletList().run(),
        },
      ],
    },
    {
      title: 'Tools',
      items: [
        { type: 'tooltip', icon: MessageSquare, title: 'Add Tooltip', action: onAddTooltip },
        { type: 'hyperlink', icon: Link, title: 'Add Link', action: onAddHyperlink },
      ],
    },
  ];
};
