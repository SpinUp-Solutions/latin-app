'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Page } from '@/src/types/lesson';
import ContentRenderer from './content-renderer';
import { ExerciseErrorBoundary } from './exercise-error-boundary';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { isExerciseType } from '@/src/utils/lessonUtils';
import { DiagramAuditSubmission } from '@/src/features/sentence-diagramming';
import type { ExerciseAnswer, ExerciseAnswerEvent, RuntimeMode } from '@/src/types/runtime-mode';
import type { GeneratedExerciseRenderContext, ResolvedGeneratedExerciseState } from './content-renderer';
import type { VocabularyPoolStudyData } from '@/src/types/vocabulary';

interface PageTemplateProps {
  page: Page;
  pageIndex?: number;
  lessonId?: string;
  onExerciseComplete?: (exerciseId: string, score: number) => void;
  onCompletionAccepted?: (exerciseId: string, score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: (event: ExerciseAnswerEvent) => void;
  answers?: Record<string, ExerciseAnswer>;
  resolvedExerciseState?: Record<string, ResolvedGeneratedExerciseState>;
  allowGeneratedExerciseQueries?: boolean;
  generatedExerciseContext?: GeneratedExerciseRenderContext;
  vocabularyPoolId?: string | null;
  resolvedVocabularyPool?: VocabularyPoolStudyData;
  onPageComplete?: () => void;
  onDiagrammingAttempt?: (itemIndex: number, exerciseId: string, attempt: DiagramAuditSubmission) => void;
}

export const PageTemplate: React.FC<PageTemplateProps> = ({
  page,
  pageIndex,
  lessonId,
  onExerciseComplete,
  onCompletionAccepted,
  runtimeMode = 'practice',
  onAnswer,
  answers,
  resolvedExerciseState,
  allowGeneratedExerciseQueries = false,
  generatedExerciseContext,
  vocabularyPoolId,
  resolvedVocabularyPool,
  onPageComplete,
  onDiagrammingAttempt,
}) => {
  const [completedExercises, setCompletedExercises] = useState<Set<number>>(() => new Set());

  const exerciseItems = page.items.filter(item => isExerciseType(item.type));
  const totalExercises = exerciseItems.length;

  useEffect(() => {
    setCompletedExercises(new Set());
  }, [page.id]);

  useEffect(() => {
    if (!onPageComplete || totalExercises === 0 || completedExercises.size !== totalExercises) return;

    const autoAdvance = page.autoAdvance || { enabled: true, delay: 2000 };
    if (!autoAdvance.enabled) return;

    const timer = setTimeout(() => {
      onPageComplete();
    }, autoAdvance.delay);

    return () => clearTimeout(timer);
  }, [completedExercises, onPageComplete, page.autoAdvance, totalExercises]);

  const handleItemComplete = useCallback(
    (itemIndex: number, score: number) => {
      const item = page.items[itemIndex];

      if (isExerciseType(item.type)) {
        onExerciseComplete?.(item.id, score);

        setCompletedExercises(previous => {
          if (previous.has(itemIndex)) return previous;
          const next = new Set(previous);
          next.add(itemIndex);
          return next;
        });
      }
    },
    [onExerciseComplete, page.items]
  );
  return (
    <motion.div
      key={page.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6">
      {page.title && (
        <h2 className="text-xl font-serif text-roman-red mb-4">
          <SimpleRichDisplay key={page.title} content={page.title} />
        </h2>
      )}

      {page.items.map((item, index: number) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="space-y-4">
          <ExerciseErrorBoundary
            key={item.id}
            lessonId={lessonId}
            exerciseId={item.id}
            contentType={item.type}
            pageIndex={pageIndex}
            itemIndex={index}>
            <ContentRenderer
              content={item}
              pageIndex={pageIndex}
              itemIndex={index}
              runtimeMode={runtimeMode}
              onAnswer={onAnswer}
              initialAnswer={answers?.[item.id]}
              resolvedExerciseState={resolvedExerciseState?.[item.id]}
              allowGeneratedExerciseQueries={allowGeneratedExerciseQueries}
              generatedExerciseContext={generatedExerciseContext}
              vocabularyPoolId={vocabularyPoolId}
              resolvedVocabularyPool={resolvedVocabularyPool}
              onComplete={(score: number) => handleItemComplete(index, score)}
              onCompletionAccepted={score => onCompletionAccepted?.(item.id, score)}
              onDiagrammingAttempt={attempt => onDiagrammingAttempt?.(index, item.id, attempt)}
            />
          </ExerciseErrorBoundary>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default PageTemplate;
