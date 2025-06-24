import { ContentItem } from './content';

export interface VocabularyItem {
  id: string;
  latin: string;
  english: string;
  pronunciation?: string;
  audioPath?: string | null;
  example?: string;
  partOfSpeech?: string;
  notes?: string;
}

export interface VocabularyContent extends ContentItem {
  type: 'vocabulary';
  vocabularyItems: VocabularyItem[];
  studyMode?: 'flashcards' | 'list' | 'quiz';
}
