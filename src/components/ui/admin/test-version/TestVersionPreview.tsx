'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { TestTakingView } from '@/src/components/ui/test/test-taking-view';
import { isExerciseType } from '@/src/lib/content/registry';
import type { Page } from '@/src/types/page';
import type { ExerciseAnswer, ExerciseAnswerEvent } from '@/src/types/runtime-mode';

interface TestVersionPreviewProps {
  title: string;
  description?: string;
  pages: Page[];
  vocabularyPoolId?: string | null;
}

export function TestVersionPreview({ title, description, pages, vocabularyPoolId }: TestVersionPreviewProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ExerciseAnswer>>({});
  const [completedExerciseIds, setCompletedExerciseIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('Preview mode — answers are not saved.');

  const totalExercises = useMemo(
    () => pages.reduce((total, page) => total + page.items.filter(item => isExerciseType(item.type)).length, 0),
    [pages]
  );

  useEffect(() => {
    setPageIndex(0);
    setAnswers({});
    setCompletedExerciseIds(new Set());
    setStatus('Preview mode — answers are not saved.');
  }, [pages]);

  const handleAnswer = (event: ExerciseAnswerEvent) => {
    setAnswers(current => ({ ...current, [event.exerciseId]: event.answer }));
  };

  const handleExerciseComplete = (exerciseId: string) => {
    setCompletedExerciseIds(current => new Set(current).add(exerciseId));
  };

  if (pages.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <FileCheck2 className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="text-gray-500">Add a page to see the test preview</p>
        </div>
      </div>
    );
  }

  return (
    <TestTakingView
      title={title}
      description={description}
      pages={pages}
      currentPageIndex={pageIndex}
      answeredCount={completedExerciseIds.size}
      totalExercises={totalExercises}
      allowGeneratedExerciseQueries
      vocabularyPoolId={vocabularyPoolId}
      preview
      embedded
      status={status}
      answers={answers}
      onAnswer={handleAnswer}
      onExerciseComplete={handleExerciseComplete}
      onPrevious={() => setPageIndex(index => Math.max(0, index - 1))}
      onNext={() => setPageIndex(index => Math.min(pages.length - 1, index + 1))}
      onReview={() => setStatus('Review and submission are unavailable in preview. Answers are not saved.')}
    />
  );
}
