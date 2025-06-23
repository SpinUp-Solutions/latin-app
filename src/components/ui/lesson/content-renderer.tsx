'use client';

import React from 'react';
import IntroComponent from './intro-component';
import MatchingTable from '../exercises/matching-table';
import ConjugationTable from './conjugation-table';
import FillExercise from '../exercises/fill-exercise';
import TextSelectionExercise from '../exercises/text-selection-exercise';
import VerbAnalysisExercise from '../exercises/verb-analysis-exercise';
import VerbConjugationExercise from '../exercises/verb-conjugation-exercise';
import { ContentItem, TextContent, EmphasisContent, TableContent, VocabularyContent } from '@/src/types/lesson';
import {
  MatchingExercise,
  FillExercise as FillExerciseType,
  TextSelectionExercise as TextSelectionExerciseType,
  VerbAnalysisExercise as VerbAnalysisExerciseType,
  VerbConjugationExercise as VerbConjugationExerciseType,
} from '@/src/types/exercise';
import { VocabularyViewer } from './VocabularyViewer';

interface ContentRendererProps {
  content: ContentItem;
  onComplete?: () => void;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({ content, onComplete }) => {
  switch (content.type) {
    case 'text':
      return <IntroComponent title={content.title || ''} content={(content as TextContent).content} className="" />;

    case 'emphasis': //enum
      return (
        <IntroComponent
          title={content.title || ''}
          content={(content as EmphasisContent).content}
          className="text-roman-red"
        />
      );

    case 'table':
      const tableContent = content as TableContent;
      return <ConjugationTable data={tableContent.tableData} className="my-4" />;

    case 'vocabulary':
      return <VocabularyViewer content={content as VocabularyContent} />;

    case 'matching':
      const matchingExercise = content as MatchingExercise;
      return <MatchingTable exercise={matchingExercise} onComplete={onComplete} />;

    case 'fill':
      return <FillExercise exercise={content as FillExerciseType} onComplete={onComplete} />;

    case 'text-selection':
      return <TextSelectionExercise exercise={content as TextSelectionExerciseType} onComplete={onComplete} />;

    case 'verb-analysis':
      return <VerbAnalysisExercise exercise={content as VerbAnalysisExerciseType} onComplete={onComplete} />;

    case 'verb-conjugation':
      return <VerbConjugationExercise exercise={content as VerbConjugationExerciseType} onComplete={onComplete} />;

    default:
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-500">Unknown content type: {content.type}</p>
        </div>
      );
  }
};

export default ContentRenderer;
