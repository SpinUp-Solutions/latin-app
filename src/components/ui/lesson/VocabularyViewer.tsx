'use client';

import React from 'react';
import { VocabularyContent } from '@/src/types/lesson';
import { BookOpen } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { VocabularyStudyView } from './VocabularyStudyView';

interface VocabularyViewerProps {
  content: VocabularyContent;
}

export function VocabularyViewer({ content }: VocabularyViewerProps) {
  const vocabularyItems = content.vocabularyItems || [];

  if (vocabularyItems.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-serif text-gray-800">
            <SimpleRichDisplay content={content.title || 'Vocabulary'} />
          </h2>
          <p className="text-roman-stone">No vocabulary items available</p>
        </div>
        <RomanCard>
          <RomanCardContent className="p-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">This vocabulary list is empty.</p>
          </RomanCardContent>
        </RomanCard>
      </div>
    );
  }

  const defaultMode = content.studyMode === 'quiz' ? 'flashcards' : content.studyMode || 'flashcards';

  return (
    <VocabularyStudyView
      title={content.title || 'Vocabulary'}
      subtitle={`Study these ${vocabularyItems.length} words`}
      items={vocabularyItems}
      audioPath={content.audioPath}
      defaultMode={defaultMode}
    />
  );
}
