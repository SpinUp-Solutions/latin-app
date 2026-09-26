'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useAppSelector } from '@/src/store/hooks';
import { useGetStudentPoolQuery } from '@/src/store/api/vocabularyPoolApi';
import { useGetStudentLessonQuery } from '@/src/store/api/lessonApi';
import { useAuth } from '@/src/hooks/useAuth';
import type { VocabularyPoolContent, VocabularyPoolStudyData } from '@/src/types/vocabulary';
import { VocabularyNotice } from './vocabulary-notice';
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
        <VocabularyNotice
          title={content.title || resolvedPool.name}
          subtitle={`From: ${resolvedPool.name}`}
          message="This vocabulary pool is empty."
        />
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
        <VocabularyNotice
          title={content.title || 'Vocabulary Pool'}
          subtitle="Loading vocabulary..."
          message="Loading lesson data..."
          status="loading"
        />
      );
    }

    return <VocabularyNotice title={content.title || 'Vocabulary Pool'} message="No vocabulary pool assigned." />;
  }

  if (poolError) {
    return (
      <VocabularyNotice
        message="Failed to load vocabulary pool"
        detail="The assigned vocabulary pool could not be loaded. It may have been removed or is temporarily unavailable."
        status="error"
      />
    );
  }

  if (poolLoading || !vocabularyPool) {
    return (
      <VocabularyNotice
        title={content.title || 'Vocabulary'}
        subtitle="Loading vocabulary..."
        message="Loading words from vocabulary pool..."
        status="loading"
      />
    );
  }

  if (vocabularyPool.items.length === 0) {
    return (
      <VocabularyNotice
        title={content.title || vocabularyPool.name}
        subtitle={`From: ${vocabularyPool.name}`}
        message="This vocabulary pool is empty."
      />
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
