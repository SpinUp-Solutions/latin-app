'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { useAppSelector } from '@/src/store/hooks';
import { useGetStudentPoolQuery } from '@/src/store/api/vocabularyPoolApi';
import { useGetStudentLessonQuery } from '@/src/store/api/lessonApi';
import { useAuth } from '@/src/hooks/useAuth';
import type { VocabularyPoolContent, VocabularyPoolStudyData } from '@/src/types/vocabulary';
import { VocabularyStudyView } from './VocabularyStudyView';

interface VocabularyPoolViewerProps {
  content: VocabularyPoolContent;
  poolId?: string | null;
  resolvedPool?: VocabularyPoolStudyData;
}

export function VocabularyPoolViewer({ content, poolId, resolvedPool }: VocabularyPoolViewerProps) {
  const params = useParams();
  const lessonIdParam = params?.lessonId;
  const lessonId = Array.isArray(lessonIdParam) ? lessonIdParam[0] : lessonIdParam;
  const { user } = useAuth();

  const currentLesson = useAppSelector(state => state.lessonEditor.currentLesson);
  const poolIdFromEditor = !poolId && !resolvedPool ? currentLesson?.vocabulary_pool || '' : '';

  const { data: studentLesson, isLoading: lessonsLoading } = useGetStudentLessonQuery(
    { lessonId: lessonId ?? '', userId: user?.uid ?? '' },
    {
      skip: Boolean(poolId || resolvedPool || poolIdFromEditor) || !lessonId || !user?.uid,
    }
  );

  const poolIdFromLesson = studentLesson?.vocabulary_pool || '';

  const poolIdToUse = poolId || poolIdFromEditor || poolIdFromLesson;
  const isResolvingPoolId = !poolId && !resolvedPool && !poolIdFromEditor && Boolean(lessonId) && lessonsLoading;

  const {
    data: vocabularyPool,
    isLoading: poolLoading,
    error: poolError,
  } = useGetStudentPoolQuery(poolIdToUse, { skip: Boolean(resolvedPool) || !poolIdToUse });

  if (resolvedPool) {
    if (resolvedPool.items.length === 0) {
      return (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-serif text-gray-800">
              <SimpleRichDisplay content={content.title || resolvedPool.name} />
            </h2>
            <p className="text-roman-stone">From: {resolvedPool.name}</p>
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

    return (
      <VocabularyStudyView
        title={content.title || resolvedPool.name}
        subtitle={`From: ${resolvedPool.name} • ${resolvedPool.items.length} words`}
        items={resolvedPool.items}
        audioPath={content.audioPath}
        defaultMode="flashcards"
        showPronunciation={false}
        showNotes={false}
      />
    );
  }

  if (!poolIdToUse) {
    if (isResolvingPoolId) {
      return (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-serif text-gray-800">
              <SimpleRichDisplay content={content.title || 'Vocabulary Pool'} />
            </h2>
            <p className="text-roman-stone">Loading vocabulary...</p>
          </div>
          <RomanCard>
            <RomanCardContent className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red mx-auto mb-4" />
              <p className="text-gray-500">Loading lesson data...</p>
            </RomanCardContent>
          </RomanCard>
        </div>
      );
    }

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
            <p className="text-gray-500">No vocabulary pool assigned.</p>
          </RomanCardContent>
        </RomanCard>
      </div>
    );
  }

  if (poolError) {
    return (
      <div className="space-y-6">
        <RomanCard>
          <RomanCardContent className="p-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-red-300 mb-4" />
            <p className="text-red-600 font-medium">Failed to load vocabulary pool</p>
            <p className="text-roman-stone text-sm mt-2">
              The assigned vocabulary pool could not be loaded. It may have been removed or is temporarily unavailable.
            </p>
          </RomanCardContent>
        </RomanCard>
      </div>
    );
  }

  if (poolLoading || !vocabularyPool) {
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

  if (vocabularyPool.items.length === 0) {
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

  return (
    <VocabularyStudyView
      title={content.title || vocabularyPool.name}
      subtitle={`From: ${vocabularyPool.name} • ${vocabularyPool.items.length} words`}
      items={vocabularyPool.items}
      audioPath={content.audioPath}
      defaultMode="flashcards"
      showPronunciation={false}
      showNotes={false}
    />
  );
}
