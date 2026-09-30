import { Mark, mergeAttributes } from '@tiptap/core';

interface HyperlinkOptions {
  HTMLAttributes: Record<string, unknown>;
}

interface HyperlinkAttrs {
  href: string;
  target?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hyperlink: {
      setHyperlink: (attributes: HyperlinkAttrs) => ReturnType;
      unsetHyperlink: () => ReturnType;
    };
  }
}

export const Hyperlink = Mark.create<HyperlinkOptions>({
  name: 'hyperlink',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      href: {
        default: null,
      },
      target: {
        default: '_self',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-hyperlink]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-hyperlink': 'true',
        class: 'hyperlink-text cursor-pointer underline text-blue-600 hover:text-blue-800 transition-colors',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setHyperlink:
        (attributes: HyperlinkAttrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      unsetHyperlink:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
