import { ComponentType } from 'react';
import { RenderableContentItem } from '@/src/types/page';
// Import removed - types are not used directly in this file

export interface EditorProps<T extends RenderableContentItem = RenderableContentItem> {
  content: T;
  onChange: (content: RenderableContentItem) => void;
}

export type EditorRegistry = {
  [K in RenderableContentItem['type']]: ComponentType<EditorProps<Extract<RenderableContentItem, { type: K }>>>;
};

export const getEditorTitle = (contentType: string): string => {
  switch (contentType) {
    case 'text':
      return 'Edit Text Content';
    case 'emphasis':
      return 'Edit Emphasis Content';
    case 'table':
      return 'Edit Table Content';
    case 'vocabulary':
      return 'Edit Vocabulary Content';
    case 'matching':
      return 'Edit Matching Exercise';
    case 'fill':
      return 'Edit Fill-in-Blank Exercise';
    case 'text-selection':
      return 'Edit Text Selection Exercise';
    case 'fill-embolded-text':
      return 'Edit Fill In Embolded Text Exercise';
    case 'sentence-diagramming':
      return 'Edit Sentence Diagramming Exercise';
    case 'multiple-choice':
      return 'Edit Multiple Choice Exercise';
    case 'odd-one-out':
      return 'Edit Odd One Out Exercise';
    case 'table-fill':
      return 'Edit Table Fill Exercise';
    case 'click-on-multiple-words':
      return 'Edit Click On Multiple Words Exercise';
    case 'generated-translation':
      return 'Edit Generated Translation Exercise';
    default:
      return `Edit ${contentType} Content`;
  }
};
