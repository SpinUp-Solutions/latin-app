'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { useAppSelector } from '@/src/store/hooks';
import { useGetPoolQuery } from '@/src/store/api/vocabularyPoolApi';
import { useGetStudentLessonsQuery } from '@/src/store/api/lessonApi';
import type { VocabularyPoolContent } from '@/src/types/vocabulary';
import type { Word } from '@/src/types/admin-vocabulary';
import { VocabularyStudyView, type VocabularyStudyItem } from './VocabularyStudyView';

interface VocabularyPoolViewerProps {
  content: VocabularyPoolContent;
}

export function VocabularyPoolViewer({ content }: VocabularyPoolViewerProps) {
  const params = useParams();
  const lessonIdParam = params?.lessonId;
  const lessonId = Array.isArray(lessonIdParam) ? lessonIdParam[0] : lessonIdParam;

  const currentLesson = useAppSelector(state => state.lessonEditor.currentLesson);
  const poolIdFromEditor = currentLesson?.vocabulary_pool || '';

  const { data: studentLessons, isLoading: lessonsLoading } = useGetStudentLessonsQuery(undefined, {
    skip: Boolean(poolIdFromEditor) || !lessonId,
  });

  const poolIdFromLesson =
    lessonId && studentLessons ? studentLessons.find(lesson => lesson.id === lessonId)?.vocabulary_pool || '' : '';

  const poolIdToUse = poolIdFromEditor || poolIdFromLesson;
  const isResolvingPoolId = !poolIdFromEditor && Boolean(lessonId) && lessonsLoading;

  const { data: vocabularyPool, isLoading: poolLoading } = useGetPoolQuery(poolIdToUse, { skip: !poolIdToUse });

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
            <p className="text-gray-500">No vocabulary pool assigned to this lesson.</p>
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

  const selectDefinitionLine = (word: Word) => {
    const definitionLines = (word.definitions ?? [])
      .flatMap(definition => definition.split('\n'))
      .map(line => line.trim())
      .filter(line => line && line !== '/' && line !== '-');

    const filteredLines = definitionLines.filter(
      line => !/(ipa|classical latin|ecclesiastical|modern italianate)/i.test(line)
    );

    const firstLine = (filteredLines[0] || definitionLines[0] || '').trim();
    if (!firstLine) return undefined;

    const firstClause = firstLine.split(';')[0].trim();
    return firstClause || undefined;
  };

  const items: VocabularyStudyItem[] = vocabularyPool.words.map((word: Word) => ({
    id: word.id,
    latin: word.dictionary_entry || word.word || '',
    english: word.translation || '',
    pronunciation: undefined,
    partOfSpeech: word.wordType || undefined,
    notes: selectDefinitionLine(word),
  }));

  const defaultMode = content.studyMode === 'quiz' ? 'flashcards' : content.studyMode || 'flashcards';

  return (
    <VocabularyStudyView
      title={content.title || vocabularyPool.name}
      subtitle={`From: ${vocabularyPool.name} • ${items.length} words`}
      items={items}
      audioPath={content.audioPath}
      defaultMode={defaultMode}
      showPronunciation={false}
      showNotes={false}
    />
  );
}
