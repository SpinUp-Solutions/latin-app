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
}

export interface VocabularyPoolContent extends ContentItem {
  type: 'vocabulary-pool';
}

export interface VocabularyPoolStudyItem {
  id: string;
  latin: string;
  english: string;
  pronunciation?: string | null;
  audioPath?: string | null;
  example?: string;
  partOfSpeech?: string;
  notes?: string;
}

export interface VocabularyPoolStudyData {
  id: string;
  name: string;
  items: VocabularyPoolStudyItem[];
}
