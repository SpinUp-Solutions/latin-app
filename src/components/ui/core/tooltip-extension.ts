import { Mark, mergeAttributes } from '@tiptap/core';
import { generateTooltipId } from '@/src/utils/tooltipUtils';
import { TooltipMarkAttrs } from '@/src/types/tooltip';

interface TooltipOptions {
  HTMLAttributes: Record<string, unknown>;
}

export interface TooltipStorage {
  onOpenDialog: (() => void) | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tooltip: {
      setTooltip: (attributes: Partial<TooltipMarkAttrs>) => ReturnType;
      unsetTooltip: () => ReturnType;
    };
  }
}

// Array/object attributes are stored as JSON under a lowercase HTML attribute name.
const jsonAttribute = (name: string) => {
  const htmlName = name.toLowerCase();
  return {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const val = element.getAttribute(htmlName);
      if (!val) return null;
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    },
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[name] ? { [htmlName]: JSON.stringify(attributes[name]) } : {},
  };
};

export const Tooltip = Mark.create<TooltipOptions, TooltipStorage>({
  name: 'tooltip',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addStorage() {
    return {
      onOpenDialog: null,
    };
  },

  addAttributes() {
    return {
      tooltipId: { default: null },
      word: { default: null },
      translation: { default: null },
      pronunciation: { default: null },
      partOfSpeech: { default: null },
      wordType: { default: null },
      definition: { default: null },
      examples: jsonAttribute('examples'),
      etymology: { default: null },
      gender: { default: null },
      declensionClass: { default: null },
      conjugationClass: { default: null },
      grammaticalInfo: { default: null },
      principalParts: jsonAttribute('principalParts'),
      link: { default: null },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-tooltip-title'),
        renderHTML: attributes => {
          if (!attributes.title) return {};
          return { 'data-tooltip-title': attributes.title };
        },
      },
      chips: jsonAttribute('chips'),
      customSections: jsonAttribute('customSections'),
      visibleFields: jsonAttribute('visibleFields'),
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-tooltip]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const tooltipId = HTMLAttributes.tooltipId || generateTooltipId();

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-tooltip': 'true',
        'data-tooltip-id': tooltipId,
        class:
          'tooltip-text cursor-help underline decoration-dotted decoration-roman-terracotta/60 hover:decoration-roman-red transition-colors',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setTooltip:
        (attributes: Partial<TooltipMarkAttrs>) =>
        ({ commands }) => {
          const tooltipId = attributes.tooltipId || generateTooltipId(attributes.word);
          return commands.setMark(this.name, { ...attributes, tooltipId });
        },
      unsetTooltip:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-t': () => {
        this.storage.onOpenDialog?.();
        return true;
      },
    };
  },
});
