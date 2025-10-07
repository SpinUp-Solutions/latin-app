'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { useAppSelector } from '@/src/store/hooks';
import { useGetPoolQuery } from '@/src/store/api/vocabularyPoolApi';
import { VocabularyWordCard } from '../vocabulary/VocabularyWordCard';
import type { VocabularyPoolContent } from '@/src/types/vocabulary';
import type { Word } from '@/src/types/admin-vocabulary';

interface VocabularyPoolViewerProps {
  content: VocabularyPoolContent;
}

export function VocabularyPoolViewer({ content }: VocabularyPoolViewerProps) {
  const currentLesson = useAppSelector(state => state.lessonEditor.currentLesson);
  const poolIdToUse = currentLesson?.vocabulary_pool || '';

  const { data: vocabularyPool, isLoading } = useGetPoolQuery(poolIdToUse, { skip: !poolIdToUse });

  if (!poolIdToUse) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-serif text-gray-800">
            <SimpleRichDisplay content={content.title || 'Vocabulary Pool'} />
          </h2>
        </div>
        <RomanCard>
          <RomanCardContent className="p-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No vocabulary pool selected.</p>
            <p className="text-sm text-gray-400 mt-2">Please select a vocabulary pool in the editor.</p>
          </RomanCardContent>
        </RomanCard>
      </div>
    );
  }

  // Loading state
  if (isLoading || !vocabularyPool) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-serif text-gray-800">
            <SimpleRichDisplay content={content.title || 'Vocabulary'} />
          </h2>
          <p className="text-roman-stone">Loading vocabulary...</p>
        </div>
        <RomanCard>
          <RomanCardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red mx-auto mb-4" />
            <p className="text-gray-500">Loading words from vocabulary pool...</p>
          </RomanCardContent>
        </RomanCard>
      </div>
    );
  }

  // Handle empty vocabulary case
  if (!vocabularyPool.words || vocabularyPool.words.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-serif text-gray-800">
            <SimpleRichDisplay content={content.title || vocabularyPool.name} />
          </h2>
          <p className="text-roman-stone">From: {vocabularyPool.name}</p>
        </div>
        <RomanCard>
          <RomanCardContent className="p-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">This vocabulary pool is empty.</p>
          </RomanCardContent>
        </RomanCard>
      </div>
    );
  }

  const words = vocabularyPool.words;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-serif text-gray-800">
          <SimpleRichDisplay content={content.title || vocabularyPool.name} />
        </h2>
        <p className="text-roman-stone">
          From: {vocabularyPool.name} • {words.length} words
        </p>
      </div>

      <div className="space-y-4">
        {words.map((word: Word) => (
          <VocabularyWordCard key={word.id} word={word} variant="lesson" />
        ))}
      </div>
    </div>
  );
}
