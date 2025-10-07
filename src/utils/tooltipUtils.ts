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
import { Lesson, Page, RenderableContentItem } from '@/src/types/lesson';

export const generateTooltipId = (word?: string): string => {
  const randomId = Math.random().toString(36).substring(2, 11);
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

const findTooltipMark = (editor: Editor, from: number, to: number): Mark | null => {
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
  const mark = findTooltipMark(editor, from, to);
  return mark as TooltipMark | null;
};

export const getEmptyFormData = (): TooltipFormData => createDefaultFormData();

const isValidTooltipFormData = (data: unknown): data is TooltipFormData => {
  return (
    typeof data === 'object' && data !== null && 'word' in data && typeof (data as TooltipFormData).word === 'string'
  );
};

const isValidTooltipData = (data: unknown): data is TooltipData => {
  return isValidTooltipFormData(data) && 'id' in data && typeof (data as TooltipData).id === 'string';
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

export const extractTooltipDataFromElement = (element: Element): TooltipData | null => {
  const tooltipId = element.getAttribute('data-tooltip-id');
  if (!tooltipId) return null;

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

  if (tooltipData.word || tooltipData.translation) {
    return tooltipData;
  }

  return null;
};

export const extractTooltipsFromContent = (htmlContent: string): Record<string, TooltipData> => {
  const tooltips: Record<string, TooltipData> = {};

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  const tooltipElements = tempDiv.querySelectorAll('[data-tooltip="true"]');

  tooltipElements.forEach(element => {
    const tooltipData = extractTooltipDataFromElement(element);
    if (tooltipData) {
      tooltips[tooltipData.id] = tooltipData;
    }
  });

  return tooltips;
};

/**
 * Recursively extracts tooltips from all content in a lesson structure
 */
export const extractTooltipsFromLesson = (lesson: Lesson): Record<string, TooltipData> => {
  const allTooltips: Record<string, TooltipData> = {};

  const extractFromContentArray = (items: RenderableContentItem[]) => {
    items.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        // Check for content property (TipTap editor content)
        if ('content' in item && typeof item.content === 'string') {
          const tooltips = extractTooltipsFromContent(item.content);
          Object.assign(allTooltips, tooltips);
        }

        // Check for sentence content (in exercises)
        if (
          'data' in item &&
          item.data &&
          typeof item.data === 'object' &&
          'sentence' in item.data &&
          item.data.sentence &&
          typeof item.data.sentence === 'object' &&
          'content' in item.data.sentence &&
          typeof item.data.sentence.content === 'string'
        ) {
          const tooltips = extractTooltipsFromContent(item.data.sentence.content);
          Object.assign(allTooltips, tooltips);
        }

        // Recursively check nested objects and arrays
        Object.values(item).forEach(value => {
          if (Array.isArray(value)) {
            extractFromContentArray(value);
          } else if (typeof value === 'object' && value !== null) {
            extractFromContentArray([value as RenderableContentItem]);
          }
        });
      }
    });
  };

  // Extract from unified pages
  if (lesson.pages && Array.isArray(lesson.pages)) {
    lesson.pages.forEach((page: Page) => {
      if (page.items && Array.isArray(page.items)) {
        extractFromContentArray(page.items);
      }
    });
  }

  return allTooltips;
};

/**
 * Extracts only the tooltips used by a specific content item
 */
export const extractTooltipsFromContentItem = (item: RenderableContentItem): Record<string, TooltipData> => {
  const itemTooltips: Record<string, TooltipData> = {};

  if (typeof item === 'object' && item !== null) {
    if ('content' in item && typeof item.content === 'string') {
      const tooltips = extractTooltipsFromContent(item.content);
      Object.assign(itemTooltips, tooltips);
    }

    if (
      'data' in item &&
      item.data &&
      typeof item.data === 'object' &&
      'sentence' in item.data &&
      item.data.sentence &&
      typeof item.data.sentence === 'object' &&
      'content' in item.data.sentence &&
      typeof item.data.sentence.content === 'string'
    ) {
      const tooltips = extractTooltipsFromContent(item.data.sentence.content);
      Object.assign(itemTooltips, tooltips);
    }

    Object.values(item).forEach(value => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nestedTooltips = extractTooltipsFromContentItem(value as RenderableContentItem);
        Object.assign(itemTooltips, nestedTooltips);
      }
    });
  }

  return itemTooltips;
};
