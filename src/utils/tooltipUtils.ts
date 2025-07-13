import { Editor } from '@tiptap/react';
import { TooltipData, TooltipFormData, MousePosition, TooltipPosition } from '@/src/types/tooltip';

export const generateTooltipId = (word?: string): string => {
  const randomId = Math.random().toString(36).substr(2, 9);
  return word ? `${word}-${Date.now()}-${randomId}` : randomId;
};

const createDefaultFormData = (word = ''): TooltipFormData => ({
  word,
  translation: '',
  pronunciation: '',
  partOfSpeech: '',
  wordType: '',
  definition: '',
  examples: [],
  etymology: '',
  gender: '',
  declensionClass: '',
  conjugationClass: '',
  grammaticalInfo: '',
  principalParts: [],
});

export const transformToFormData = (data: TooltipData | null, selectedText = ''): TooltipFormData => {
  if (!data) {
    return createDefaultFormData(selectedText);
  }
  
  return {
    word: data.word || selectedText,
    translation: data.translation || '',
    pronunciation: data.pronunciation || '',
    partOfSpeech: data.partOfSpeech || '',
    wordType: data.wordType || '',
    definition: data.definition || '',
    examples: data.examples || [],
    etymology: data.etymology || '',
    gender: data.gender || '',
    declensionClass: data.declensionClass || '',
    conjugationClass: data.conjugationClass || '',
    grammaticalInfo: data.grammaticalInfo || '',
    principalParts: data.principalParts || [],
  };
};

export const cleanFormData = (formData: TooltipFormData): Omit<TooltipFormData, never> => {
  return Object.entries(formData).reduce((acc, [key, value]) => {
    if (value && (typeof value === 'string' ? value.trim() : true)) {
      if (Array.isArray(value)) {
        const filtered = value.filter(item => item.trim());
        if (filtered.length > 0) {
          acc[key as keyof TooltipFormData] = filtered as any;
        }
      } else if (typeof value === 'string' && value.trim()) {
        acc[key as keyof TooltipFormData] = value.trim() as any;
      }
    }
    return acc;
  }, {} as Omit<TooltipFormData, never>);
};

export const findTooltipMark = (editor: Editor, from: number, to: number) => {
  let tooltipMark = null;
  
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText && !tooltipMark) {
      const foundMark = node.marks.find(mark => mark.type.name === 'tooltip');
      if (foundMark && from >= pos && from < pos + node.nodeSize) {
        tooltipMark = foundMark;
      }
    }
  });
  
  return tooltipMark;
};

export const getEmptyFormData = (): TooltipFormData => createDefaultFormData();

export const calculateTooltipPosition = (
  mousePosition: MousePosition,
  tooltipHeight: number,
  tooltipWidth = 288,
  offset = 18,
  margin = 16
): TooltipPosition => {
  let x = mousePosition.x;
  let y = mousePosition.y - tooltipHeight - offset;
  let isBelow = false;

  // Horizontal boundary checks
  if (x + tooltipWidth / 2 > window.innerWidth - margin) {
    x = window.innerWidth - tooltipWidth / 2 - margin;
  }
  if (x - tooltipWidth / 2 < margin) {
    x = tooltipWidth / 2 + margin;
  }

  // Vertical boundary check - if tooltip would go above viewport, show below cursor
  if (y < margin) {
    y = mousePosition.y + offset + 10;
    isBelow = true;
  }

  return { x, y, isBelow };
};