import { Mark, mergeAttributes } from '@tiptap/core';
import { generateTooltipId } from '@/src/utils/tooltipUtils';

export interface TooltipOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tooltip: {
      /**
       * Set a tooltip
       */
      setTooltip: (attributes: {
        tooltipId?: string;
        word: string;
        translation?: string;
        pronunciation?: string;
        partOfSpeech?: string;
        wordType?: string;
        definition?: string;
        examples?: string[];
        etymology?: string;
      }) => ReturnType;
      /**
       * Toggle a tooltip
       */
      toggleTooltip: (attributes: {
        tooltipId?: string;
        word: string;
        translation?: string;
        pronunciation?: string;
        partOfSpeech?: string;
        wordType?: string;
        definition?: string;
        examples?: string[];
        etymology?: string;
      }) => ReturnType;
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
        attributes =>
        ({ commands }) => {
          const tooltipId = attributes.tooltipId || generateTooltipId(attributes.word);
          return commands.setMark(this.name, { ...attributes, tooltipId });
        },
      toggleTooltip:
        attributes =>
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
