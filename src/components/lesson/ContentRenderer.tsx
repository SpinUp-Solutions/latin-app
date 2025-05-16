'use client';

import React from 'react';
import IntroComponent from '../IntroComponent';
import MatchingTable from '../MatchingTable';
import ConjugationTable from '../ConjugationTable';
import { ContentItem, TextContent, EmphasisContent, TableContent } from '@/src/types/lesson';
import { MatchingExercise, FillExercise } from '@/src/types/exercise';

interface ContentRendererProps {
  content: ContentItem;
  onComplete?: () => void;
}

export const ContentRenderer: React.FC<ContentRendererProps> = ({ content, onComplete }) => {
  // Render different content based on type
  switch (content.type) {
    case 'text':
      return <IntroComponent title={content.title || ''} content={(content as TextContent).content} className="" />;

    case 'emphasis':
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
      // Placeholder for fill-in-the-blank exercises
      return (
        <div className="p-4 border border-dashed rounded-lg">
          <p>Fill-in-the-blank exercise (not implemented yet)</p>
        </div>
      );

    default:
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-500">Unknown content type: {(content as any).type}</p>
        </div>
      );
  }
};

export default ContentRenderer;
