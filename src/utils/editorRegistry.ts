import { ComponentType } from 'react';
import { RenderableContentItem } from '@/src/types/page';
import { TextContent, EmphasisContent, TableContent, VocabularyContent } from '@/src/types/lesson';

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
    case 'verb-analysis':
      return 'Edit Verb Analysis Exercise';
    case 'verb-conjugation':
      return 'Edit Verb Conjugation Exercise';
    default:
      return `Edit ${contentType} Content`;
  }
};

export const isTextContent = (content: RenderableContentItem): content is TextContent => content.type === 'text';

export const isEmphasisContent = (content: RenderableContentItem): content is EmphasisContent =>
  content.type === 'emphasis';

export const isTableContent = (content: RenderableContentItem): content is TableContent => content.type === 'table';

export const isVocabularyContent = (content: RenderableContentItem): content is VocabularyContent =>
  content.type === 'vocabulary';
