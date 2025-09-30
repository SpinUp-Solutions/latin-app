'use client';

import React from 'react';
import MatchingTable from '../exercises/matching-table';
import ConjugationTable from './conjugation-table';
import FillExercise from '../exercises/fill-exercise';
import TextSelectionExercise from '../exercises/text-selection-exercise';
import FillEmboldedTextExercise from '../exercises/verb-analysis-exercise';
import { SentenceDiagrammingExercise } from '../exercises/sentence-diagramming-exercise';
import MultipleChoiceExercise from '../exercises/multiple-choice-exercise';
import OddOneOutExercise from '../exercises/odd-one-out-exercise';
import TableFillExercise from '../exercises/table-fill-exercise';
import ClickOnMultipleWordsExercise from '../exercises/click-on-multiple-words';
import { ContentItem, TextContent, TableContent, VocabularyContent, VocabularyPoolContent } from '@/src/types/lesson';
import {
  MatchingExercise,
  FillExercise as FillExerciseType,
  TextSelectionExercise as TextSelectionExerciseType,
  FillEmboldedTextExercise as FillEmboldedTextExerciseType,
  SentenceDiagrammingExercise as SentenceDiagrammingExerciseType,
  MultipleChoiceExercise as MultipleChoiceExerciseType,
  OddOneOutExercise as OddOneOutExerciseType,
  TableFillExercise as TableFillExerciseType,
  ClickOnMultipleWordsExercise as ClickOnMultipleWordsExerciseType,
} from '@/src/types/exercise';
import { VocabularyViewer } from './VocabularyViewer';
import { VocabularyPoolViewer } from './VocabularyPoolViewer';
import TextComponent from './text-component';

interface ContentRendererProps {
  content: ContentItem;
  onComplete?: (score: number) => void;
  pageIndex?: number;
  itemIndex?: number;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({ content, onComplete }) => {
  switch (content.type) {
    case 'text':
      const textContent = content as TextContent;
      return (
        <TextComponent
          title={textContent.title || ''}
          content={textContent.content}
          className=""
          audioPath={textContent.audioPath || undefined}
        />
      );

    case 'emphasis': //enum
      const emphasisContent = content as TextContent;
      return (
        <TextComponent
          title={emphasisContent.title || ''}
          content={emphasisContent.content}
          className=""
          audioPath={emphasisContent.audioPath || undefined}
        />
      );

    case 'table':
      const tableContent = content as TableContent;
      return <ConjugationTable data={tableContent.tableData} className="my-4" audioPath={tableContent.audioPath} />;

    case 'vocabulary':
      return <VocabularyViewer content={content as VocabularyContent} />;

    case 'vocabulary-pool':
      return <VocabularyPoolViewer content={content as VocabularyPoolContent} />;

    case 'matching':
      const matchingExercise = content as MatchingExercise;
      return <MatchingTable exercise={matchingExercise} onComplete={onComplete} />;

    case 'fill':
      return <FillExercise exercise={content as FillExerciseType} onComplete={onComplete} />;

    case 'text-selection':
      return <TextSelectionExercise exercise={content as TextSelectionExerciseType} onComplete={onComplete} />;

    case 'fill-embolded-text':
      return <FillEmboldedTextExercise exercise={content as FillEmboldedTextExerciseType} onComplete={onComplete} />;

    case 'sentence-diagramming':
      return (
        <SentenceDiagrammingExercise exercise={content as SentenceDiagrammingExerciseType} onComplete={onComplete} />
      );

    case 'multiple-choice':
      return <MultipleChoiceExercise exercise={content as MultipleChoiceExerciseType} onComplete={onComplete} />;

    case 'odd-one-out':
      return <OddOneOutExercise exercise={content as OddOneOutExerciseType} onComplete={onComplete} />;

    case 'table-fill':
      return <TableFillExercise exercise={content as TableFillExerciseType} onComplete={onComplete} />;

    case 'click-on-multiple-words':
      return <ClickOnMultipleWordsExercise exercise={content as ClickOnMultipleWordsExerciseType} onComplete={onComplete} />;

    default:
      return (
        <div className="text-center p-4 bg-gray-100">
          <p>Unknown content type: {content.type}</p>
          {content.type === 'intro' && (
            <p>
              You might be trying to render an old intro content type. Please update to text instead. Preview:
              <TextComponent title="" content="" className="" />
            </p>
          )}
        </div>
      );
  }
};

export default ContentRenderer;
