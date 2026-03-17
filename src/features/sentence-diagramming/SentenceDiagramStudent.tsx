import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle, ChevronLeft, ChevronRight, HelpCircle, RotateCcw, Undo2 } from 'lucide-react';
import { AnnotationKind, DEFAULT_STUDENT_TOOLS, normalizeAnnotationTools } from './annotation-spec';
import {
  applyDiagramAnnotation,
  compareDiagramAnnotationSets,
  DiagramAnnotation,
  resetDiagramColorAnnotations,
} from './model';
import { DiagramSelection, getSelectionSpanForKind } from './selection';
import { SentenceDiagramSurface } from './SentenceDiagramSurface';
import { SentenceDiagramToolbar } from './SentenceDiagramToolbar';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { useExerciseFeedback } from '@/src/hooks/useExerciseFeedback';
import { FeedbackDisplay } from '@/src/components/ui/feedback';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';

interface SentenceDiagramStudentProps {
  exercise: SentenceDiagrammingExercise;
  onComplete?: (score: number) => void;
}

export const SentenceDiagramStudent: React.FC<SentenceDiagramStudentProps> = ({ exercise, onComplete }) => {
  const [annotations, setAnnotations] = useState<DiagramAnnotation[]>([]);
  const [selection, setSelection] = useState<DiagramSelection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
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
    handleCorrect,
    handleIncorrect,
    reset,
  } = useExerciseFeedback(exercise.feedbackConfig);

  const progress = comparison.expected > 0 ? Math.round((comparison.matched / comparison.expected) * 100) : 0;

  // Compute which annotation kinds are active on the current selection
  const activeKinds = useMemo(() => {
    const kinds = new Set<AnnotationKind>();

    if (!selection) {
      return kinds;
    }

    for (const annotation of annotations) {
      const selStart = selection.span.startTokenIndex;
      const selEnd = selection.span.endTokenIndex;
      const annStart = annotation.span.startTokenIndex;
      const annEnd = annotation.span.endTokenIndex;

      // Check if annotation overlaps with selection
      if (annStart <= selEnd && annEnd >= selStart) {
        kinds.add(annotation.kind);
      }
    }

    return kinds;
  }, [annotations, selection]);

  const pushHistory = useCallback((prev: DiagramAnnotation[]) => {
    historyRef.current = [...historyRef.current.slice(-29), prev];
  }, []);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();

    if (prev !== undefined) {
      setAnnotations(prev);
      setMessage(null);
    }
  }, []);

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
    }

    setAnnotations(result.annotations);
    setMessage(result.error || null);
  };

  const handleSubmit = () => {
    const result = compareDiagramAnnotationSets(annotations, exercise.data.solutionAnnotations, exercise.data.tokens);

    if (result.isComplete) {
      handleCorrect(true);
      onComplete?.(Math.round(result.accuracy));
      return;
    }

    handleIncorrect();
  };

  const handleReset = () => {
    if (annotations.length > 0) {
      pushHistory(annotations);
    }

    setAnnotations([]);
    setSelection(null);
    setMessage(null);
    setShowHint(false);
    setCurrentHintIndex(0);
    reset();
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {/* Header — compact */}
        <div className="px-5 py-3 border-b border-stone-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-stone-900">{exercise.title}</h3>
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

        {/* Surface FIRST — the main interaction area */}
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
            disabled={isCorrect === true}
          />
        </div>

        {/* Toolbar BELOW — select first, then label */}
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
            }}
            onClear={() => {
              if (isCorrect === true) {
                return;
              }

              pushHistory(annotations);
              setAnnotations([]);
              setMessage(null);
            }}
          />
        </div>

        {/* Progress bar */}
        <div className="mx-5 mb-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-stone-400 tabular-nums whitespace-nowrap">
            {comparison.matched}/{comparison.expected}
          </span>
        </div>

        {/* Hints */}
        {showHint && exercise.data.hints.length > 0 ? (
          <div className="border-t border-blue-100 bg-blue-50/50 px-5 py-3">
            <div className="flex items-start gap-2">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-blue-800">{exercise.data.hints[currentHintIndex]}</div>
                {exercise.data.hints.length > 1 ? (
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentHintIndex(index => Math.max(0, index - 1))}
                      disabled={currentHintIndex === 0}
                      className="rounded p-0.5 text-blue-600 hover:bg-blue-100 disabled:opacity-30">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[11px] tabular-nums text-blue-500">
                      {currentHintIndex + 1}/{exercise.data.hints.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentHintIndex(index => Math.min(exercise.data.hints.length - 1, index + 1))}
                      disabled={currentHintIndex === exercise.data.hints.length - 1}
                      className="rounded p-0.5 text-blue-600 hover:bg-blue-100 disabled:opacity-30">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-5 py-3">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isCorrect === true || annotations.length === 0}
            className="gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            Check
          </Button>
          <Button
            size="sm"
            onClick={handleUndo}
            variant="ghost"
            disabled={isCorrect === true || historyRef.current.length === 0}
            className="gap-1.5 text-stone-500">
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
          {exercise.data.hints.length > 0 ? (
            <Button
              size="sm"
              onClick={() => setShowHint(current => !current)}
              variant="ghost"
              className="gap-1.5 text-stone-500">
              <HelpCircle className="h-3.5 w-3.5" />
              {showHint ? 'Hide Hints' : 'Hint'}
            </Button>
          ) : null}
          <Button size="sm" onClick={handleReset} variant="ghost" className="gap-1.5 text-stone-500">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      <FeedbackDisplay isCorrect={isCorrect} message={feedbackMessage} level={level} />
    </div>
  );
};

export default SentenceDiagramStudent;
