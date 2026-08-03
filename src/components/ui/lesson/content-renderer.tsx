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
import { DiagramAuditSubmission } from '@/src/features/sentence-diagramming';
import {
  TEST_RUNTIME_FEEDBACK_CONFIG,
  type ExerciseAnswerEvent,
  type ExerciseAnswerHandler,
  type ExerciseAnswer,
  type RuntimeMode,
  type TestTranslationGradeHandler,
} from '@/src/types/runtime-mode';
import type { TestTranslationItemGrade } from '@/src/types/test';
import { isExerciseType } from '@/src/lib/content/registry';
import type { GeneratedTranslationItem } from '@/src/utils/exercises/generatedTranslationExercise';
import type {
  FormIdentificationItem,
  MultiAnswerFormIdentificationItem,
  SingleFieldFormIdentificationItem,
} from '@/src/types/exercises/schemas/form-identification';
import type { VocabularyPoolStudyData } from '@/src/types/vocabulary';

export interface ResolvedGeneratedExerciseState {
  items: unknown[];
}

interface ContentRendererProps {
  content: ContentItem;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: (event: ExerciseAnswerEvent) => void;
  initialAnswer?: ExerciseAnswer;
  initialTestTranslationGrades?: Record<string, TestTranslationItemGrade>;
  onGradeTestTranslation?: TestTranslationGradeHandler;
  resolvedExerciseState?: ResolvedGeneratedExerciseState;
  allowGeneratedExerciseQueries?: boolean;
  vocabularyPoolId?: string | null;
  resolvedVocabularyPool?: VocabularyPoolStudyData;
  pageIndex?: number;
  itemIndex?: number;
  onDiagrammingAttempt?: (attempt: DiagramAuditSubmission) => void;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({
  content,
  onComplete,
  runtimeMode,
  pageIndex,
  itemIndex,
  onAnswer,
  initialAnswer,
  initialTestTranslationGrades,
  onGradeTestTranslation,
  resolvedExerciseState,
  allowGeneratedExerciseQueries = false,
  vocabularyPoolId,
  resolvedVocabularyPool,
  onDiagrammingAttempt,
}) => {
  const mode = runtimeMode ?? 'practice';
  const renderedContent =
    mode === 'test' && isExerciseType(content.type)
      ? ({ ...content, feedbackConfig: TEST_RUNTIME_FEEDBACK_CONFIG } as ContentItem)
      : content;
  const handleAnswer: ExerciseAnswerHandler | undefined = onAnswer
    ? answer => onAnswer({ exerciseId: content.id, answer, pageIndex, itemIndex })
    : undefined;
  const modeProps = { runtimeMode: mode, onAnswer: handleAnswer, initialAnswer };

  switch (renderedContent.type) {
    case 'text':
      const textContent = renderedContent as TextContent;
      return (
        <TextComponent
          title={textContent.title || ''}
          content={textContent.content}
          className=""
          audioPath={textContent.audioPath || undefined}
        />
      );

    case 'emphasis': //enum
      const emphasisContent = renderedContent as TextContent;
      return (
        <TextComponent
          title={emphasisContent.title || ''}
          content={emphasisContent.content}
          className=""
          audioPath={emphasisContent.audioPath || undefined}
        />
      );

    case 'table':
      const tableContent = renderedContent as TableContent;
      return <ConjugationTable data={tableContent.tableData} className="my-4" audioPath={tableContent.audioPath} />;

    case 'vocabulary':
      return <VocabularyViewer content={renderedContent as VocabularyContent} />;

    case 'vocabulary-pool':
      return (
        <VocabularyPoolViewer
          content={renderedContent as VocabularyPoolContent}
          poolId={vocabularyPoolId}
          resolvedPool={resolvedVocabularyPool}
        />
      );

    case 'matching':
      const matchingExercise = renderedContent as MatchingExercise;
      return <MatchingTable exercise={matchingExercise} onComplete={onComplete} {...modeProps} />;

    case 'fill':
      return <FillExercise exercise={renderedContent as FillExerciseType} onComplete={onComplete} {...modeProps} />;

    case 'text-selection':
      return (
        <TextSelectionExercise
          exercise={renderedContent as TextSelectionExerciseType}
          onComplete={onComplete}
          {...modeProps}
        />
      );

    case 'fill-embolded-text':
      return (
        <FillEmboldedTextExercise
          exercise={renderedContent as FillEmboldedTextExerciseType}
          onComplete={onComplete}
          {...modeProps}
        />
      );

    case 'sentence-diagramming':
      return (
        <SentenceDiagrammingExercise
          exercise={renderedContent as SentenceDiagrammingExerciseType}
          onComplete={onComplete}
          {...modeProps}
          onAttempt={onDiagrammingAttempt}
        />
      );

    case 'multiple-choice':
      return (
        <MultipleChoiceExercise
          exercise={renderedContent as MultipleChoiceExerciseType}
          onComplete={onComplete}
          {...modeProps}
        />
      );

    case 'odd-one-out':
      return (
        <OddOneOutExercise exercise={renderedContent as OddOneOutExerciseType} onComplete={onComplete} {...modeProps} />
      );

    case 'table-fill':
      return (
        <TableFillExercise exercise={renderedContent as TableFillExerciseType} onComplete={onComplete} {...modeProps} />
      );

    case 'click-on-multiple-words':
      return (
        <ClickOnMultipleWordsExercise
          exercise={renderedContent as ClickOnMultipleWordsExerciseType}
          onComplete={onComplete}
          {...modeProps}
        />
      );

    case 'generated-translation':
      return (
        <GeneratedTranslationExercise
          exercise={renderedContent as GeneratedTranslationExerciseType}
          onComplete={onComplete}
          {...modeProps}
          allowGeneratedExerciseQueries={allowGeneratedExerciseQueries}
          resolvedItems={resolvedExerciseState?.items as GeneratedTranslationItem[] | undefined}
        />
      );

    case 'generated-form-identification':
      return (
        <GeneratedFormIdentificationExercise
          exercise={renderedContent as GeneratedFormIdentificationExerciseType}
          onComplete={onComplete}
          {...modeProps}
          allowGeneratedExerciseQueries={allowGeneratedExerciseQueries}
          resolvedItems={
            resolvedExerciseState?.items as
              | Array<FormIdentificationItem | MultiAnswerFormIdentificationItem | SingleFieldFormIdentificationItem>
              | undefined
          }
        />
      );

    case 'translation-grading':
      return (
        <TranslationGradingExercise
          exercise={renderedContent as TranslationGradingExerciseType}
          onComplete={onComplete}
          {...modeProps}
          initialTestGrades={initialTestTranslationGrades}
          onGradeTestTranslation={onGradeTestTranslation}
        />
      );

    case 'listening-passage':
      return (
        <ListeningPassageExercise exercise={renderedContent as ListeningPassageExerciseType} onComplete={onComplete} />
      );

    default:
      return (
        <div className="text-center p-4 bg-gray-100">
          <p>Unknown content type: {renderedContent.type}</p>
          {renderedContent.type === 'intro' && (
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
