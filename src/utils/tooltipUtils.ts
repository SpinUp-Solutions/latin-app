import { Editor } from '@tiptap/react';
import { Mark } from '@tiptap/pm/model';
import {
  TooltipData,
  TooltipFormData,
  MousePosition,
  TooltipPosition,
  TooltipMark,
  isTooltipMark,
} from '@/src/types/tooltip';

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
  if (!data || !isValidTooltipData(data)) {
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

export const cleanFormData = (formData: TooltipFormData): Partial<TooltipFormData> => {
  return Object.entries(formData).reduce((acc, [key, value]) => {
    if (value && (typeof value === 'string' ? value.trim() : true)) {
      if (Array.isArray(value)) {
        const filtered = value.filter(item => (typeof item === 'string' ? item.trim() : true));
        if (filtered.length > 0) {
          (acc as Record<string, unknown>)[key] = filtered;
        }
      } else if (typeof value === 'string' && value.trim()) {
        (acc as Record<string, unknown>)[key] = value.trim();
      } else if (typeof value !== 'string' && value !== null && value !== undefined) {
        (acc as Record<string, unknown>)[key] = value;
      }
    }
    return acc;
  }, {} as Partial<TooltipFormData>);
};

export const findTooltipMark = (editor: Editor, from: number, to: number): Mark | null => {
  let tooltipMark: Mark | null = null;

  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText && !tooltipMark) {
      const foundMark = node.marks.find(mark => isTooltipMark(mark));
      if (foundMark && from >= pos && from < pos + node.nodeSize) {
        tooltipMark = foundMark;
      }
    }
  });

  return tooltipMark;
};

export const findTooltipMarkWithData = (editor: Editor, from: number, to: number): TooltipMark | null => {
  let tooltipMark: TooltipMark | null = null;

  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText && !tooltipMark) {
      const foundMark = node.marks.find(mark => isTooltipMark(mark));
      if (foundMark && from >= pos && from < pos + node.nodeSize) {
        tooltipMark = foundMark as TooltipMark;
      }
    }
  });

  return tooltipMark;
};

export const getEmptyFormData = (): TooltipFormData => createDefaultFormData();

export const isValidTooltipFormData = (data: unknown): data is TooltipFormData => {
  return (
    typeof data === 'object' && data !== null && 'word' in data && typeof (data as TooltipFormData).word === 'string'
  );
};

export const isValidTooltipData = (data: unknown): data is TooltipData => {
  return isValidTooltipFormData(data) && 'id' in data && typeof (data as TooltipData).id === 'string';
};

export const extractTooltipAttrs = (mark: TooltipMark): TooltipFormData => {
  const attrs = mark.attrs;
  return {
    word: attrs.word,
    translation: attrs.translation,
    pronunciation: attrs.pronunciation,
    partOfSpeech: attrs.partOfSpeech,
    wordType: attrs.wordType,
    definition: attrs.definition,
    examples: attrs.examples,
    etymology: attrs.etymology,
    gender: attrs.gender,
    declensionClass: attrs.declensionClass,
    conjugationClass: attrs.conjugationClass,
    grammaticalInfo: attrs.grammaticalInfo,
    principalParts: attrs.principalParts,
  };
};

export const createTooltipMarkAttrs = (formData: TooltipFormData, tooltipId: string): TooltipMark['attrs'] => {
  return {
    tooltipId,
    word: formData.word,
    translation: formData.translation,
    pronunciation: formData.pronunciation,
    partOfSpeech: formData.partOfSpeech,
    wordType: formData.wordType,
    definition: formData.definition,
    examples: formData.examples,
    etymology: formData.etymology,
    gender: formData.gender,
    declensionClass: formData.declensionClass,
    conjugationClass: formData.conjugationClass,
    grammaticalInfo: formData.grammaticalInfo,
    principalParts: formData.principalParts,
  };
};

export const safeStringValue = (value: string | undefined | null): string => {
  return value?.trim() || '';
};

export const safeArrayValue = <T>(value: T[] | undefined | null): T[] => {
  return Array.isArray(value) ? value : [];
};

export const mergeTooltipData = (
  base: Partial<TooltipFormData>,
  override: Partial<TooltipFormData>
): TooltipFormData => {
  const mergedData: TooltipFormData = {
    word: safeStringValue(override.word) || safeStringValue(base.word) || '',
    translation: safeStringValue(override.translation) || safeStringValue(base.translation),
    pronunciation: safeStringValue(override.pronunciation) || safeStringValue(base.pronunciation),
    partOfSpeech: safeStringValue(override.partOfSpeech) || safeStringValue(base.partOfSpeech),
    wordType: safeStringValue(override.wordType) || safeStringValue(base.wordType),
    definition: safeStringValue(override.definition) || safeStringValue(base.definition),
    examples:
      safeArrayValue(override.examples).length > 0 ? safeArrayValue(override.examples) : safeArrayValue(base.examples),
    etymology: safeStringValue(override.etymology) || safeStringValue(base.etymology),
    gender: safeStringValue(override.gender) || safeStringValue(base.gender),
    declensionClass: safeStringValue(override.declensionClass) || safeStringValue(base.declensionClass),
    conjugationClass: safeStringValue(override.conjugationClass) || safeStringValue(base.conjugationClass),
    grammaticalInfo: safeStringValue(override.grammaticalInfo) || safeStringValue(base.grammaticalInfo),
    principalParts:
      safeArrayValue(override.principalParts).length > 0
        ? safeArrayValue(override.principalParts)
        : safeArrayValue(base.principalParts),
  };

  return mergedData;
};

export const calculateTooltipPosition = (
  elementPosition: MousePosition,
  tooltipHeight: number,
  tooltipWidth = 288,
  offset = 12,
  margin = 16
): TooltipPosition => {
  let x = elementPosition.x;

  // Use a minimum height if tooltip height is 0 or very small
  const effectiveHeight = tooltipHeight > 50 ? tooltipHeight : 180;

  // Position the tooltip so its bottom edge is `offset` pixels above the word
  // This keeps consistent spacing regardless of tooltip height
  let y = elementPosition.y - offset;
  let isBelow = false;

  // Horizontal boundary checks
  if (x + tooltipWidth / 2 > window.innerWidth - margin) {
    x = window.innerWidth - tooltipWidth / 2 - margin;
  }
  if (x - tooltipWidth / 2 < margin) {
    x = tooltipWidth / 2 + margin;
  }

  // Check if there's enough space above for the entire tooltip
  if (y - effectiveHeight < margin) {
    // Not enough space above, show below instead
    y = elementPosition.y + offset + 10;
    isBelow = true;
  }

  return { x, y, isBelow };
};

/**
 * Extracts tooltip data from HTML content and returns it as a Record
 * suitable for Redux store population
 */
export const extractTooltipsFromContent = (htmlContent: string): Record<string, TooltipData> => {
  const tooltips: Record<string, TooltipData> = {};
  
  // Create a temporary DOM element to parse the HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  
  // Find all elements with tooltip attributes
  const tooltipElements = tempDiv.querySelectorAll('[data-tooltip="true"]');
  
  tooltipElements.forEach((element) => {
    const tooltipId = element.getAttribute('data-tooltip-id');
    if (!tooltipId) return;
    
    // Extract all tooltip data from attributes
    const examples = element.getAttribute('examples');
    const principalParts = element.getAttribute('principalParts');
    
    const tooltipData: TooltipData = {
      id: tooltipId,
      word: element.getAttribute('word') || '',
      translation: element.getAttribute('translation') || '',
      pronunciation: element.getAttribute('pronunciation') || '',
      partOfSpeech: element.getAttribute('partOfSpeech') || '',
      wordType: element.getAttribute('wordtype') || '',
      definition: element.getAttribute('definition') || '',
      examples: examples ? examples.split(',').map(ex => ex.trim()) : [],
      etymology: element.getAttribute('etymology') || '',
      gender: element.getAttribute('gender') || '',
      declensionClass: element.getAttribute('declensionClass') || '',
      conjugationClass: element.getAttribute('conjugationClass') || '',
      grammaticalInfo: element.getAttribute('grammaticalInfo') || '',
      principalParts: principalParts ? principalParts.split(',').map(part => part.trim()) : [],
    };
    
    // Only add if we have meaningful data
    if (tooltipData.word || tooltipData.translation) {
      tooltips[tooltipId] = tooltipData;
    }
  });
  
  return tooltips;
};

/**
 * Recursively extracts tooltips from all content in a lesson structure
 */
export const extractTooltipsFromLesson = (lesson: any): Record<string, TooltipData> => {
  const allTooltips: Record<string, TooltipData> = {};
  
  const extractFromContentArray = (items: any[]) => {
    items.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        // Check for content property (TipTap editor content)
        if (item.content && typeof item.content === 'string') {
          const tooltips = extractTooltipsFromContent(item.content);
          Object.assign(allTooltips, tooltips);
        }
        
        // Check for sentence content (in exercises)
        if (item.data?.sentence?.content && typeof item.data.sentence.content === 'string') {
          const tooltips = extractTooltipsFromContent(item.data.sentence.content);
          Object.assign(allTooltips, tooltips);
        }
        
        // Recursively check nested objects and arrays
        Object.values(item).forEach(value => {
          if (Array.isArray(value)) {
            extractFromContentArray(value);
          } else if (typeof value === 'object' && value !== null) {
            extractFromContentArray([value]);
          }
        });
      }
    });
  };
  
  // Extract from introduction pages
  if (lesson.introduction && Array.isArray(lesson.introduction)) {
    lesson.introduction.forEach((page: any) => {
      if (page.content && Array.isArray(page.content)) {
        extractFromContentArray(page.content);
      }
    });
  }
  
  // Extract from exercise pages
  if (lesson.exercises && Array.isArray(lesson.exercises)) {
    lesson.exercises.forEach((page: any) => {
      if (page.content && Array.isArray(page.content)) {
        extractFromContentArray(page.content);
      }
    });
  }
  
  return allTooltips;
};
