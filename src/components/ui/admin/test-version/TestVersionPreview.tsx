'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, FileCheck2, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { SectionReviewView } from '@/src/components/ui/test/section-review-view';
import { TestTakingView } from '@/src/components/ui/test/test-taking-view';
import { isExerciseType } from '@/src/lib/content/registry';
import { isExerciseAnswerComplete } from '@/src/lib/tests/answer-completion';
import {
  generatedExerciseWordsRequest,
  isGeneratedExercise,
  resolveGeneratedExercises,
  type GeneratedExercise,
} from '@/src/lib/tests/generated-exercises';
import { advancedVocabularyApi } from '@/src/store/api/advancedVocabularyApi';
import { useAppDispatch } from '@/src/store/hooks';
import type { Exercise } from '@/src/types/exercises';
import type { Page } from '@/src/types/page';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { StudentTestDelivery } from '@/src/types/test';

interface TestVersionPreviewProps {
  title: ReactNode;
  description?: ReactNode;
  pages: Page[];
  vocabularyPoolId?: string | null;
}

const PREVIEW_STATUS = 'Preview mode — answers are not saved.';

interface PreviewProgress {
  sectionIndex: number;
  phase: 'answering' | 'review' | 'finished';
  answers: Record<string, ExerciseAnswer>;
}

const START: PreviewProgress = { sectionIndex: 0, phase: 'answering', answers: {} };

type Resolution =
  | { key: string; resolvedExercises: StudentTestDelivery['resolvedExercises'] }
  | { key: string; failed: true };

/** Resolves every generated question before the preview starts, as starting a student attempt does. */
function useResolvedGeneratedExercises(pages: Page[]) {
  const dispatch = useAppDispatch();
  const key = JSON.stringify(pages.flatMap(page => page.items).filter(isGeneratedExercise));
  const [resolution, setResolution] = useState<Resolution | null>(null);

  useEffect(() => {
    let cancelled = false;
    const exercises = JSON.parse(key) as GeneratedExercise[];
    const loadWords = (exercise: GeneratedExercise) =>
      dispatch(
        advancedVocabularyApi.endpoints.getGeneratedExerciseWords.initiate(
          { exercise: generatedExerciseWordsRequest(exercise), source: { kind: 'admin-preview' } },
          { subscribe: false }
        )
      )
        .unwrap()
        .then(result => result.words);
    void resolveGeneratedExercises(exercises, loadWords).then(
      resolvedExercises => {
        if (!cancelled) setResolution({ key, resolvedExercises });
      },
      () => {
        if (!cancelled) setResolution({ key, failed: true });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [dispatch, key]);

  return resolution?.key === key ? resolution : null;
}

function PreviewNotice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-gray-300 p-6 text-center text-gray-600">
      {icon}
      {children}
    </div>
  );
}

/** Walks a test version section by section, exactly as a student attempt does, without saving anything. */
export function TestVersionPreview({ title, description, pages, vocabularyPoolId }: TestVersionPreviewProps) {
  const resolution = useResolvedGeneratedExercises(pages);
  const [{ sectionIndex, phase, answers }, setProgress] = useState(START);
  const setPhase = (next: PreviewProgress['phase']) => setProgress(current => ({ ...current, phase: next }));

  // Any edit to the version restarts the preview from its first section.
  useEffect(() => {
    setProgress(START);
  }, [pages]);

  if (pages.length === 0) {
    return (
      <PreviewNotice icon={<FileCheck2 className="h-12 w-12 text-gray-400" />}>
        <p className="text-gray-500">Add a page to see the test preview</p>
      </PreviewNotice>
    );
  }

  if (!resolution) {
    return (
      <PreviewNotice icon={<Loader2 className="h-8 w-8 animate-spin text-roman-red" aria-hidden="true" />}>
        <p role="status">Preparing generated questions…</p>
      </PreviewNotice>
    );
  }

  if ('failed' in resolution) {
    return (
      <PreviewNotice icon={<AlertTriangle className="h-8 w-8 text-amber-600" aria-hidden="true" />}>
        <p>
          A generated exercise could not produce questions for this preview. Students could not start this version
          either. Check its word filters.
        </p>
      </PreviewNotice>
    );
  }

  if (phase === 'finished') {
    return (
      <PreviewNotice icon={<FileCheck2 className="h-10 w-10 text-roman-red" aria-hidden="true" />}>
        <div className="space-y-1">
          <p className="font-medium text-gray-800">End of the test preview</p>
          <p className="text-sm">Students submit the test when they confirm the last section. Nothing was saved.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setProgress(START)}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Restart preview
        </Button>
      </PreviewNotice>
    );
  }

  const page = pages[Math.min(sectionIndex, pages.length - 1)];
  const { resolvedExercises } = resolution;
  const delivery: StudentTestDelivery = { versionId: 'preview', pages: [page], resolvedExercises };
  const exercises = page.items.filter(item => isExerciseType(item.type)) as Exercise[];
  const answeredCount = exercises.filter(exercise =>
    isExerciseAnswerComplete(exercise, answers[exercise.id], resolvedExercises[exercise.id]?.items.length ?? 0)
  ).length;
  const recordAnswer = ({ exerciseId, answer }: { exerciseId: string; answer: ExerciseAnswer }) =>
    setProgress(current => ({ ...current, answers: { ...current.answers, [exerciseId]: answer } }));

  return phase === 'answering' ? (
    <TestTakingView
      key={page.id}
      title={title}
      description={description}
      page={page}
      sectionIndex={sectionIndex}
      totalSections={pages.length}
      answeredCount={answeredCount}
      totalExercises={exercises.length}
      status={PREVIEW_STATUS}
      preview
      embedded
      answers={answers}
      resolvedExerciseState={resolvedExercises}
      vocabularyPoolId={vocabularyPoolId}
      onAnswer={recordAnswer}
      onReview={() => setPhase('review')}
    />
  ) : (
    <SectionReviewView
      key={page.id}
      title={title}
      sectionIndex={sectionIndex}
      totalSections={pages.length}
      delivery={delivery}
      vocabularyPoolId={vocabularyPoolId}
      answers={answers}
      onAnswer={recordAnswer}
      answeredCount={answeredCount}
      totalExercises={exercises.length}
      status={PREVIEW_STATUS}
      preview
      embedded
      onReturn={() => setPhase('answering')}
      onConfirm={() =>
        setProgress(current =>
          current.sectionIndex >= pages.length - 1
            ? { ...current, phase: 'finished' }
            : { ...current, sectionIndex: current.sectionIndex + 1, phase: 'answering' }
        )
      }
    />
  );
}
