'use client';

import React from 'react';
import { VocabularyContent } from '@/src/types/lesson';
import { VocabularyNotice } from './vocabulary-notice';
import { VocabularyStudyView } from './VocabularyStudyView';

interface VocabularyViewerProps {
  content: VocabularyContent;
}

export function VocabularyViewer({ content }: VocabularyViewerProps) {
  const vocabularyItems = content.vocabularyItems || [];

  if (vocabularyItems.length === 0) {
    return (
      <VocabularyNotice
        title={content.title || 'Special Vocabulary'}
        subtitle="No vocabulary items available"
        message="This vocabulary list is empty."
      />
    );
  }

  return (
    <VocabularyStudyView
      title={content.title || 'Special Vocabulary'}
      subtitle={`Study these ${vocabularyItems.length} words`}
      items={vocabularyItems}
      audioPath={content.audioPath}
      defaultMode="flashcards"
    />
  );
}
