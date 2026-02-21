import { Mark, mergeAttributes } from '@tiptap/core';
import { generateTooltipId } from '@/src/utils/tooltipUtils';
import { TooltipMarkAttrs } from '@/src/types/tooltip';

export interface TooltipOptions {
  HTMLAttributes: Record<string, unknown>;
}

export interface TooltipStorage {
  onOpenDialog: (() => void) | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tooltip: {
      setTooltip: (attributes: Partial<TooltipMarkAttrs>) => ReturnType;
      toggleTooltip: (attributes: Partial<TooltipMarkAttrs>) => ReturnType;
      unsetTooltip: () => ReturnType;
    };
  }
}

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
      tooltipId: {
        default: null,
      },
      word: {
        default: null,
      },
      translation: {
        default: null,
      },
      pronunciation: {
        default: null,
      },
      partOfSpeech: {
        default: null,
      },
      wordType: {
        default: null,
      },
      definition: {
        default: null,
      },
      examples: {
        default: null,
        parseHTML: element => {
          const val = element.getAttribute('examples');
          if (!val) return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        },
        renderHTML: attributes => {
          if (!attributes.examples) return {};
          return { examples: JSON.stringify(attributes.examples) };
        },
      },
      etymology: {
        default: null,
      },
      gender: {
        default: null,
      },
      declensionClass: {
        default: null,
      },
      conjugationClass: {
        default: null,
      },
      grammaticalInfo: {
        default: null,
      },
      principalParts: {
        default: null,
        parseHTML: element => {
          const val = element.getAttribute('principalparts');
          if (!val) return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        },
        renderHTML: attributes => {
          if (!attributes.principalParts) return {};
          return { principalparts: JSON.stringify(attributes.principalParts) };
        },
      },
      link: {
        default: null,
      },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-tooltip-title'),
        renderHTML: attributes => {
          if (!attributes.title) return {};
          return { 'data-tooltip-title': attributes.title };
        },
      },
      chips: {
        default: null,
        parseHTML: element => {
          const val = element.getAttribute('chips');
          if (!val) return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        },
        renderHTML: attributes => {
          if (!attributes.chips) return {};
          return { chips: JSON.stringify(attributes.chips) };
        },
      },
      customSections: {
        default: null,
        parseHTML: element => {
          const val = element.getAttribute('customsections');
          if (!val) return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        },
        renderHTML: attributes => {
          if (!attributes.customSections) return {};
          return { customsections: JSON.stringify(attributes.customSections) };
        },
      },
      visibleFields: {
        default: null,
        parseHTML: element => {
          const val = element.getAttribute('visiblefields');
          if (!val) return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        },
        renderHTML: attributes => {
          if (!attributes.visibleFields) return {};
          return { visiblefields: JSON.stringify(attributes.visibleFields) };
        },
      },
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
      toggleTooltip:
        (attributes: Partial<TooltipMarkAttrs>) =>
        ({ commands }) => {
          const tooltipId = attributes.tooltipId || generateTooltipId(attributes.word);
          return commands.toggleMark(this.name, { ...attributes, tooltipId });
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
