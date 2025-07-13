interface BaseTooltipFields {
  word: string;
  translation?: string;
  pronunciation?: string;
  partOfSpeech?: string;
  wordType?: string;
  definition?: string;
  examples?: string[];
  etymology?: string;
}

interface GrammaticalFields {
  gender?: string;
  declensionClass?: string;
  conjugationClass?: string;
  grammaticalInfo?: string;
  principalParts?: string[];
}

export interface TooltipData extends BaseTooltipFields, GrammaticalFields {
  id: string;
}

export interface TooltipFormData extends BaseTooltipFields, GrammaticalFields {
  word: string;
}

export interface MousePosition {
  x: number;
  y: number;
}

export interface TooltipPosition {
  x: number;
  y: number;
  isBelow: boolean;
}