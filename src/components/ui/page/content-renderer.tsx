'use client';

import React from 'react';
import IntroComponent from './IntroComponent';
import MatchingTable from './MatchingTable';
import ConjugationTable from './ConjugationTable';
import FillExercise from './FillExercise';
import TextSelectionExercise from './TextSelectionExercise';
import VerbAnalysisExercise from './VerbAnalysisExercise';
import VerbConjugationExercise from './VerbConjugationExercise';
import { VocabularyViewer } from '@/src/components/lesson/VocabularyViewer';
import { ContentItem, TextContent, EmphasisContent, TableContent, VocabularyContent } from '@/src/types/lesson';
import {
  MatchingExercise,
  FillExercise as FillExerciseType,
  TextSelectionExercise as TextSelectionExerciseType,
  VerbAnalysisExercise as VerbAnalysisExerciseType,
  VerbConjugationExercise as VerbConjugationExerciseType,
} from '@/src/types/exercise';

interface ContentRendererProps {
  content: ContentItem;
  onComplete?: () => void;
  isCompleted?: boolean;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({ content, onComplete, isCompleted = false }) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _isCompleted = isCompleted; // Available for future completion state styling

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
      return (
        <div className="space-y-4">
          {content.title && <h3 className="text-lg font-serif text-roman-red mb-2">{content.title}</h3>}
          {matchingExercise.instructions && (
            <div className="p-4 bg-roman-parchment rounded-lg mb-4">
              <p>{matchingExercise.instructions}</p>
            </div>
          )}
          <MatchingTable
            leftColumn={matchingExercise.data.leftColumn}
            rightColumn={matchingExercise.data.rightColumn}
            finalAnswer={matchingExercise.data.answers}
            onComplete={onComplete}
          />
        </div>
      );

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
