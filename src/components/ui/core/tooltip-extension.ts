import { Mark, mergeAttributes } from '@tiptap/core';
import { generateTooltipId } from '@/src/utils/tooltipUtils';
import { TooltipMarkAttrs } from '@/src/types/tooltip';

export interface TooltipOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tooltip: {
      /**
       * Set a tooltip
       */
      setTooltip: (attributes: Partial<TooltipMarkAttrs>) => ReturnType;
      /**
       * Toggle a tooltip
       */
      toggleTooltip: (attributes: Partial<TooltipMarkAttrs>) => ReturnType;
      /**
       * Unset a tooltip
       */
      unsetTooltip: () => ReturnType;
    };
  }
}

export const Tooltip = Mark.create<TooltipOptions>({
  name: 'tooltip',

  addOptions() {
    return {
      HTMLAttributes: {},
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
      },
      link: {
        default: null,
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
          'tooltip-text cursor-help underline decoration-dotted decoration-blue-500/60 hover:decoration-blue-500 transition-colors',
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
});
