import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle, HelpCircle, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { ANNOTATION_SPECS, AnnotationKind, DEFAULT_STUDENT_TOOLS, normalizeAnnotationTools } from './annotation-spec';
import {
  applyDiagramAnnotation,
  compareDiagramAnnotationSets,
  DiagramAnnotation,
  DiagramAttempt,
  DiagramComparisonResult,
  normalizeSentenceDiagramFeedbackContent,
  resetDiagramColorAnnotations,
} from './model';
import { SentenceDiagramFeedbackView } from './SentenceDiagramFeedbackContent';
import {
  DiagramSelection,
  getActiveAnnotationKindsForSelection,
  getAnnotationsForSelection,
  getSelectionSpanForKind,
} from './selection';
import { SentenceDiagramSurface } from './SentenceDiagramSurface';
import { SentenceDiagramToolbar } from './SentenceDiagramToolbar';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { useDelayedExerciseReset } from '@/src/hooks/useDelayedExerciseReset';
import { useExerciseProgression } from '@/src/hooks/useExerciseProgression';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import type { FeedbackLevel } from '@/src/types/exercises/base';
import { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import type { ExerciseAnswerHandler, RuntimeMode } from '@/src/types/runtime-mode';
import { resolveRuntimeMode } from '@/src/types/runtime-mode';

export interface SentenceDiagramStudentProps {
  exercise: SentenceDiagrammingExercise;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  testMode?: boolean;
  onAttempt?: (attempt: DiagramAttempt) => void;
}

interface SentenceDiagramFeedbackPanelProps {
  isCorrect: boolean | null;
  message: string;
  level?: FeedbackLevel | null;
  hint?: React.ReactNode;
  correctAnswer?: React.ReactNode;
  explanation?: React.ReactNode;
  showExplanation?: boolean;
  onContinue?: () => void;
  comparison?: DiagramComparisonResult;
}

const SentenceDiagramFeedbackPanel: React.FC<SentenceDiagramFeedbackPanelProps> = ({
  isCorrect,
  message,
  level,
  hint,
  correctAnswer,
  explanation,
  showExplanation = false,
  onContinue,
  comparison,
}) => {
  const shouldShowHint = isCorrect === false && Boolean(level?.showHint) && Boolean(hint);
  const shouldShowAnswer = isCorrect === false && Boolean(level?.showAnswer) && Boolean(correctAnswer);
  const shouldShowExplanation = isCorrect === true && Boolean(showExplanation) && Boolean(explanation);
  const hasMessage = Boolean(message);
  const hasDifferences = isCorrect === false && Boolean(comparison?.differences.length);

  if (
    isCorrect === null ||
    (!hasMessage && !hasDifferences && !shouldShowHint && !shouldShowAnswer && !shouldShowExplanation)
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {hasMessage ? (
        <div
          className={`rounded-2xl border px-4 py-3 shadow-sm ${
            isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}>
          <div className="flex items-start gap-3">
            {isCorrect ? (
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            )}
            <div className="min-w-0 flex-1 text-sm font-medium">
              <SimpleRichDisplay content={message} />
            </div>
          </div>
        </div>
      ) : null}

      {isCorrect === false && comparison && comparison.differences.length > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-white px-4 py-3 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-800">What differs</div>
          <ul className="space-y-1 text-sm text-stone-700">
            {comparison.differences.map((difference, index) => {
              const text = difference.text || 'Selected text';
              const expected = difference.expectedKind ? ANNOTATION_SPECS[difference.expectedKind].shortLabel : null;
              const actual = difference.actualKind ? ANNOTATION_SPECS[difference.actualKind].shortLabel : null;
              const detail =
                difference.type === 'kind-mismatch'
                  ? `your answer ${actual}; expected ${expected}`
                  : difference.type === 'missing'
                    ? `missing ${expected}`
                    : `extra ${actual}`;

              return (
                <li key={`${difference.type}-${difference.text}-${index}`}>
                  <span className="font-semibold text-stone-900">{text}:</span> {detail}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {shouldShowHint ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <HelpCircle className="h-4 w-4" />
            Hint
          </div>
          <div className="text-amber-950">{hint}</div>
        </div>
      ) : null}

      {shouldShowAnswer ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-900">
            <CheckCircle className="h-4 w-4" />
            Correct Answer
          </div>
          <div className="text-blue-950">{correctAnswer}</div>
        </div>
      ) : null}

      {shouldShowExplanation ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sky-900">
            <CheckCircle className="h-4 w-4" />
            Explanation
          </div>
          <div className="text-sky-950">{explanation}</div>
        </div>
      ) : null}

      {isCorrect === true && onContinue ? (
        <Button onClick={onContinue} className="w-full">
          Continue
        </Button>
      ) : null}
    </div>
  );
};

export const SentenceDiagramStudent: React.FC<SentenceDiagramStudentProps> = ({
  exercise,
  onComplete,
  runtimeMode,
  onAnswer,
  testMode,
  onAttempt,
}) => {
  const mode = resolveRuntimeMode(runtimeMode, testMode);
  const assessmentMode = mode !== 'practice';
  const [annotations, setAnnotations] = useState<DiagramAnnotation[]>([]);
  const [selection, setSelection] = useState<DiagramSelection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [surfaceResetKey, setSurfaceResetKey] = useState(0);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const historyRef = useRef<DiagramAnnotation[][]>([]);
  const normalizedTools = normalizeAnnotationTools(exercise.data.availableStudentTools);
  const availableTools = normalizedTools.length ? normalizedTools : DEFAULT_STUDENT_TOOLS;
  const comparison = useMemo(
    () => compareDiagramAnnotationSets(annotations, exercise.data.solutionAnnotations, exercise.data.tokens),
    [annotations, exercise.data.solutionAnnotations, exercise.data.tokens]
  );
  const {
    isCorrect,
    message: feedbackMessage,
    level,
    showExplanation,
    handleCorrect,
    handleIncorrect,
    clearFeedback,
    shouldResetExercise,
    resetExercise,
  } = useExerciseFeedback(exercise.feedbackConfig);

  const hintContent = useMemo(() => {
    const content = normalizeSentenceDiagramFeedbackContent(exercise.data.hint);
    return content.text.replace(/<[^>]*>/g, '').trim() || content.annotations.length > 0 ? content : null;
  }, [exercise.data.hint]);
  const explanationContent = useMemo(() => {
    const content = normalizeSentenceDiagramFeedbackContent(exercise.data.explanation);
    return content.text.replace(/<[^>]*>/g, '').trim() || content.annotations.length > 0 ? content : null;
  }, [exercise.data.explanation]);

  const progress = comparison.expected > 0 ? Math.round((comparison.matched / comparison.expected) * 100) : 0;
  const { isAwaitingConfirmation, autoAdvanceIfEnabled, confirmAdvance, cancelPendingAdvance } = useExerciseProgression(
    {
      totalItems: 1,
      itemProgressionDelay: exercise.itemProgressionDelay,
      progressionRules: exercise.feedbackConfig.progressionRules,
    }
  );

  useDelayedExerciseReset({
    shouldReset: !assessmentMode && shouldResetExercise,
    delayMs: exercise.itemProgressionDelay,
    onReset: () => {
      historyRef.current = [];
      setAnnotations([]);
      setSelection(null);
      setMessage(null);
      setSurfaceResetKey(key => key + 1);
      cancelPendingAdvance();
      resetExercise();
    },
  });

  const activeKinds = useMemo(
    () => getActiveAnnotationKindsForSelection(selection, annotations, availableTools, exercise.data.tokens),
    [annotations, availableTools, exercise.data.tokens, selection]
  );

  const selectedAnnotations = useMemo(
    () => getAnnotationsForSelection(selection, annotations, exercise.data.tokens),
    [annotations, exercise.data.tokens, selection]
  );

  const pushHistory = useCallback((prev: DiagramAnnotation[]) => {
    historyRef.current = [...historyRef.current.slice(-29), prev];
  }, []);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();

    if (prev !== undefined) {
      setAnnotations(prev);
      setMessage(null);
      clearFeedback();
    }
  }, [clearFeedback]);

  const applyTool = (kind: AnnotationKind) => {
    const span = getSelectionSpanForKind(selection, kind, exercise.data.tokens);

    if (!span) {
      setMessage(
        kind.startsWith('person-')
          ? 'Select exact ending letters inside one word before using a person tool.'
          : 'Select one or more words before applying a label.'
      );
      return;
    }

    const result = applyDiagramAnnotation({
      annotations,
      kind,
      span,
      tokens: exercise.data.tokens,
    });

    if (!result.error) {
      pushHistory(annotations);
      clearFeedback();
    }

    setAnnotations(result.annotations);
    setMessage(result.error || null);
  };

  const handleSubmit = () => {
    if (testSubmitted) return;

    onAttempt?.({
      comparison,
      studentAnnotations: annotations,
      solutionAnnotations: exercise.data.solutionAnnotations,
      tokens: exercise.data.tokens,
    });

    if (assessmentMode) {
      if (mode === 'test') onAnswer?.({ type: 'sentence-diagramming', annotations });
      setTestSubmitted(true);
      if (comparison.isComplete) handleCorrect(true);
      else handleIncorrect();
      onComplete?.(Math.round(comparison.accuracy));
      return;
    }

    if (comparison.isComplete) {
      handleCorrect(true);
      const hasVisibleExplanation =
        (exercise.feedbackConfig.successMessage?.showExplanation ?? true) && Boolean(explanationContent);

      autoAdvanceIfEnabled(() => {
        onComplete?.(Math.round(comparison.accuracy));
      }, hasVisibleExplanation);
      return;
    }

    handleIncorrect();
  };

  const handleReset = () => {
    if (isCorrect === true) {
      return;
    }

    historyRef.current = [];
    setAnnotations([]);
    setSelection(null);
    setMessage(null);
    setSurfaceResetKey(key => key + 1);
    cancelPendingAdvance();
    clearFeedback();
  };

  const correctAnswerContent =
    exercise.data.tokens.length > 0 ? (
      <SentenceDiagramFeedbackView
        content={{
          text: exercise.data.latin,
          tokens: exercise.data.tokens,
          annotations: exercise.data.solutionAnnotations,
        }}
        translation={exercise.data.translation}
      />
    ) : undefined;

  const hintBody = hintContent ? <SentenceDiagramFeedbackView content={hintContent} /> : undefined;

  const explanationBody = explanationContent ? <SentenceDiagramFeedbackView content={explanationContent} /> : undefined;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="px-5 py-3 border-b border-stone-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {exercise.title ? (
              <div className="min-w-0 flex-1 text-base font-semibold text-stone-900" role="heading" aria-level={3}>
                <SimpleRichDisplay content={exercise.title} />
              </div>
            ) : null}
            <Badge variant="outline" className="border-stone-200 text-[10px] text-stone-400">
              {exercise.data.difficulty}
            </Badge>
          </div>
          {exercise.instructions && exercise.instructions.replace(/<[^>]*>/g, '').trim() !== '' ? (
            <SimpleRichDisplay content={exercise.instructions} className="mt-1 text-sm text-stone-500" />
          ) : null}
          {exercise.data.translation ? (
            <div className="mt-2 text-sm italic text-stone-500">&ldquo;{exercise.data.translation}&rdquo;</div>
          ) : null}
        </div>

        <div className="px-5 pt-4 pb-2">
          <SentenceDiagramSurface
            tokens={exercise.data.tokens}
            annotations={annotations}
            selection={selection}
            onSelectionChange={nextSelection => {
              setSelection(nextSelection);
              setMessage(null);
            }}
            message={message}
            disabled={isCorrect === true || testSubmitted}
            resetKey={surfaceResetKey}
          />
          {selection ? (
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-500"
              aria-live="polite"
              data-testid="diagram-selection-summary">
              <span className="font-medium text-stone-700">Selected “{selection.text}”:</span>
              {selectedAnnotations.length > 0 ? (
                selectedAnnotations.map(annotation => (
                  <Badge key={annotation.id} variant="outline" className="text-[10px]">
                    {ANNOTATION_SPECS[annotation.kind].shortLabel}
                  </Badge>
                ))
              ) : (
                <span>No labels applied</span>
              )}
            </div>
          ) : null}
        </div>

        <div className="px-5 py-3">
          <SentenceDiagramToolbar
            availableTools={availableTools}
            activeKinds={activeKinds}
            disabled={isCorrect === true}
            onToolClick={applyTool}
            onResetColors={() => {
              pushHistory(annotations);
              setAnnotations(currentAnnotations =>
                resetDiagramColorAnnotations(currentAnnotations, exercise.data.tokens)
              );
              setMessage(null);
              clearFeedback();
            }}
            onClear={() => {
              if (isCorrect === true) {
                return;
              }

              pushHistory(annotations);
              setAnnotations([]);
              setMessage(null);
              setSurfaceResetKey(key => key + 1);
              cancelPendingAdvance();
              clearFeedback();
            }}
          />
        </div>

        {(exercise.feedbackConfig.progressionRules?.showProgress ?? true) ? (
          <div className="mx-5 mb-3 space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    comparison.isComplete ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-stone-400 tabular-nums whitespace-nowrap">
                {comparison.matched}/{comparison.expected} correct
              </span>
            </div>
            {(comparison.expected - comparison.matched > 0 || comparison.extra > 0) && annotations.length > 0 ? (
              <div className="flex justify-end gap-2 text-[11px] text-stone-500">
                {comparison.expected - comparison.matched > 0 ? (
                  <span>{comparison.expected - comparison.matched} missing or incorrect</span>
                ) : null}
                {comparison.extra > 0 ? (
                  <span className="text-rose-700">{comparison.extra} extra or incorrect</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-5 py-3">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isCorrect === true || testSubmitted || annotations.length === 0}
            className="gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            Check
          </Button>
          <Button
            size="sm"
            onClick={handleUndo}
            variant="ghost"
            disabled={isCorrect === true || testSubmitted || historyRef.current.length === 0}
            className="gap-1.5 text-stone-500">
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
          <Button
            size="sm"
            onClick={handleReset}
            variant="ghost"
            disabled={isCorrect === true || testSubmitted}
            className="gap-1.5 text-stone-500">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      {!assessmentMode && <SentenceDiagramFeedbackPanel
        isCorrect={isCorrect}
        message={feedbackMessage}
        level={level}
        hint={hintBody}
        correctAnswer={correctAnswerContent}
        explanation={explanationBody}
        showExplanation={showExplanation}
        onContinue={isCorrect === true && isAwaitingConfirmation ? confirmAdvance : undefined}
        comparison={isCorrect === false ? comparison : undefined}
      />}
    </div>
  );
};

export default SentenceDiagramStudent;
