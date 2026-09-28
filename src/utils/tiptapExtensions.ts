import StarterKit from '@tiptap/starter-kit';
import { Extensions } from '@tiptap/core';
import { Tooltip } from '@/src/components/ui/core/tooltip-extension';
import { Hyperlink } from '@/src/components/ui/core/hyperlink-extension';

export const getAdminExtensions = (): Extensions => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    blockquote: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
  }),
  Tooltip,
  Hyperlink,
];

export const getSimpleExtensions = ({ enableTooltips }: { enableTooltips: boolean }): Extensions => [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    blockquote: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
    dropcursor: false,
    gapcursor: false,
  }),
  ...(enableTooltips ? [Tooltip] : []),
  Hyperlink,
];
