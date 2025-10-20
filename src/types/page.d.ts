import { TextContent, EmphasisContent, TableContent } from './content';
import { VocabularyContent, VocabularyPoolContent } from './vocabulary';
import {
  MatchingExercise,
  FillExercise,
  TextSelectionExercise,
  FillEmboldedTextExercise,
  SentenceDiagrammingExercise,
  MultipleChoiceExercise,
  OddOneOutExercise,
  TableFillExercise,
  ClickOnMultipleWordsExercise,
  GeneratedFillExercise,
} from './exercises';

export type RenderableContentItem =
  | TextContent
  | EmphasisContent
  | TableContent
  | VocabularyContent
  | VocabularyPoolContent
  | MatchingExercise
  | FillExercise
  | TextSelectionExercise
  | FillEmboldedTextExercise
  | SentenceDiagrammingExercise
  | MultipleChoiceExercise
  | OddOneOutExercise
  | TableFillExercise
  | ClickOnMultipleWordsExercise
  | GeneratedFillExercise;

export interface BasePage {
  id: string;
  title?: string;
  items: RenderableContentItem[];
  audioPath?: string | null;
}

export interface Page extends BasePage {
  autoAdvance?: {
    enabled: boolean;
    delay: number;
  };
}
