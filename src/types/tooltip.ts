interface BaseTooltipFields {
  word: string;
  translation?: string;
  pronunciation?: string;
  partOfSpeech?: string;
  wordType?: string;
  definition?: string;
  examples?: string[];
  etymology?: string;
  link?: string;
  title?: string;
  chips?: string[];
  customSections?: Array<{ label: string; content: string }>;
  visibleFields?: string[];
}

interface GrammaticalFields {
  gender?: string;
  declensionClass?: string;
  conjugationClass?: string;
  grammaticalInfo?: string;
  principalParts?: string[];
}

// Unified tooltip data interface
export interface TooltipData extends BaseTooltipFields, GrammaticalFields {
  id: string;
}

// Form data interface for creating/editing tooltips
export interface TooltipFormData extends BaseTooltipFields, GrammaticalFields {}

export interface MousePosition {
  x: number;
  y: number;
}

export interface TooltipPosition {
  x: number;
  y: number;
  isBelow: boolean;
}

// TipTap mark-specific types - using the same base structure for consistency
export interface TooltipMarkAttrs extends BaseTooltipFields, GrammaticalFields {
  tooltipId: string;
}

export interface TooltipMark {
  type: { name: string };
  attrs: TooltipMarkAttrs;
}

// Type guard for tooltip marks
export const isTooltipMark = (mark: unknown): mark is TooltipMark => {
  return (
    mark !== null &&
    typeof mark === 'object' &&
    'type' in mark &&
    mark.type !== null &&
    typeof mark.type === 'object' &&
    'name' in mark.type &&
    (mark.type as { name: string }).name === 'tooltip' &&
    'attrs' in mark &&
    mark.attrs !== null &&
    typeof mark.attrs === 'object' &&
    'tooltipId' in mark.attrs &&
    typeof (mark.attrs as { tooltipId: string }).tooltipId === 'string'
  );
};
