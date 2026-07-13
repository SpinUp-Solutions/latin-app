'use client';

import React from 'react';
import MatchingTable from '../exercises/matching-table';
import ConjugationTable from './conjugation-table';
import FillExercise from '../exercises/fill-exercise';
import TextSelectionExercise from '../exercises/text-selection-exercise';
import FillEmboldedTextExercise from '../exercises/fill-embolded-text-exercise';
import { SentenceDiagrammingExercise } from '../exercises/sentence-diagramming-exercise';
import MultipleChoiceExercise from '../exercises/multiple-choice-exercise';
import OddOneOutExercise from '../exercises/odd-one-out-exercise';
import TableFillExercise from '../exercises/table-fill-exercise';
import ClickOnMultipleWordsExercise from '../exercises/click-on-multiple-words';
import GeneratedTranslationExercise from '../exercises/generated-translation-exercise';
import GeneratedFormIdentificationExercise from '../exercises/generated-form-identification-exercise';
import TranslationGradingExercise from '../exercises/translation-grading-exercise';
import ListeningPassageExercise from '../exercises/listening-passage-exercise';
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
  GeneratedTranslationExercise as GeneratedTranslationExerciseType,
  GeneratedFormIdentificationExercise as GeneratedFormIdentificationExerciseType,
  TranslationGradingExercise as TranslationGradingExerciseType,
  ListeningPassageExercise as ListeningPassageExerciseType,
} from '@/src/types/exercises';
import { VocabularyViewer } from './VocabularyViewer';
import { VocabularyPoolViewer } from './VocabularyPoolViewer';
import TextComponent from './text-component';
import { DiagramAttempt } from '@/src/features/sentence-diagramming';

interface ContentRendererProps {
  content: ContentItem;
  onComplete?: (score: number) => void;
  testMode?: boolean;
  pageIndex?: number;
  itemIndex?: number;
  onDiagrammingAttempt?: (attempt: DiagramAttempt) => void;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({
  content,
  onComplete,
  testMode = false,
  onDiagrammingAttempt,
}) => {
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
      return <MatchingTable exercise={matchingExercise} onComplete={onComplete} testMode={testMode} />;

    case 'fill':
      return <FillExercise exercise={content as FillExerciseType} onComplete={onComplete} testMode={testMode} />;

    case 'text-selection':
      return (
        <TextSelectionExercise
          exercise={content as TextSelectionExerciseType}
          onComplete={onComplete}
          testMode={testMode}
        />
      );

    case 'fill-embolded-text':
      return (
        <FillEmboldedTextExercise
          exercise={content as FillEmboldedTextExerciseType}
          onComplete={onComplete}
          testMode={testMode}
        />
      );

    case 'sentence-diagramming':
      return (
        <SentenceDiagrammingExercise
          exercise={content as SentenceDiagrammingExerciseType}
          onComplete={onComplete}
          testMode={testMode}
          onAttempt={onDiagrammingAttempt}
        />
      );

    case 'multiple-choice':
      return (
        <MultipleChoiceExercise
          exercise={content as MultipleChoiceExerciseType}
          onComplete={onComplete}
          testMode={testMode}
        />
      );

    case 'odd-one-out':
      return (
        <OddOneOutExercise exercise={content as OddOneOutExerciseType} onComplete={onComplete} testMode={testMode} />
      );

    case 'table-fill':
      return (
        <TableFillExercise exercise={content as TableFillExerciseType} onComplete={onComplete} testMode={testMode} />
      );

    case 'click-on-multiple-words':
      return (
        <ClickOnMultipleWordsExercise
          exercise={content as ClickOnMultipleWordsExerciseType}
          onComplete={onComplete}
          testMode={testMode}
        />
      );

    case 'generated-translation':
      return (
        <GeneratedTranslationExercise
          exercise={content as GeneratedTranslationExerciseType}
          onComplete={onComplete}
          testMode={testMode}
        />
      );

    case 'generated-form-identification':
      return (
        <GeneratedFormIdentificationExercise
          exercise={content as GeneratedFormIdentificationExerciseType}
          onComplete={onComplete}
          testMode={testMode}
        />
      );

    case 'translation-grading':
      return (
        <TranslationGradingExercise exercise={content as TranslationGradingExerciseType} onComplete={onComplete} />
      );

    case 'listening-passage':
      return <ListeningPassageExercise exercise={content as ListeningPassageExerciseType} onComplete={onComplete} />;

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
