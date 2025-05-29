import { Exercise } from './exercise';
import { ReactNode } from 'react';
import { TableData } from '../components/ui/page/ConjugationTable';
import { MatchingExercise, FillExercise } from './exercise';

export interface ContentItem {
  id: string;
  type: string;
  title?: string;
  audioPath?: string | null;
}

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

export interface TextContent extends ContentItem {
  type: 'text';
  content: string;
}

export interface EmphasisContent extends ContentItem {
  type: 'emphasis';
  content: string;
}

export interface TableContent extends ContentItem {
  type: 'table';
  tableData: TableData;
}

export interface VocabularyContent extends ContentItem {
  type: 'vocabulary';
  vocabularyItems: VocabularyItem[];
  studyMode?: 'flashcards' | 'list' | 'quiz';
}

export type RenderableContentItem =
  | TextContent
  | EmphasisContent
  | TableContent
  | VocabularyContent
  | MatchingExercise
  | FillExercise;

export interface IntroductionPage {
  id: string;
  title?: string;
  items: RenderableContentItem[];
  audioPath?: string | null;
}

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  introduction: IntroductionPage[];
  exercises: Exercise[];
}

export interface ComponentNarration {
  audioPath?: string | null;
  component: ReactNode;
}
