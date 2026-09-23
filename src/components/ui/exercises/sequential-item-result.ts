import { hasVisibleFeedbackContent } from '@/src/utils/feedbackVisibility';

interface SequentialItemResult {
  isCorrect: boolean;
  isLastItem: boolean;
  assessmentMode: boolean;
  showExplanation?: boolean;
  explanation?: unknown;
  finalScore: number | null;
  handleCorrect: (isLastItem?: boolean) => void;
  handleIncorrect: () => void;
  autoAdvanceIfEnabled: (afterAdvance: () => void, hasVisibleExplanation: boolean) => void;
  onCompletionAccepted?: (score: number) => void;
  onComplete?: (score: number) => void;
  clearItem: () => void;
  stopProcessing: () => void;
}

export function applySequentialItemResult({
  isCorrect,
  isLastItem,
  assessmentMode,
  showExplanation,
  explanation,
  finalScore,
  handleCorrect,
  handleIncorrect,
  autoAdvanceIfEnabled,
  onCompletionAccepted,
  onComplete,
  clearItem,
  stopProcessing,
}: SequentialItemResult) {
  const hasVisibleExplanation = (showExplanation ?? true) && hasVisibleFeedbackContent(explanation);

  if (isCorrect) {
    handleCorrect(isLastItem);

    if (isLastItem) {
      if (!assessmentMode) onCompletionAccepted?.(finalScore!);
      autoAdvanceIfEnabled(() => {
        // Retain the final answer and success state after completion.
        onComplete?.(finalScore!);
      }, hasVisibleExplanation);
      return;
    }

    autoAdvanceIfEnabled(() => {
      clearItem();
      stopProcessing();
    }, hasVisibleExplanation);
    return;
  }

  handleIncorrect();
  if (assessmentMode) {
    autoAdvanceIfEnabled(() => {
      clearItem();
      stopProcessing();
      if (finalScore !== null) onComplete?.(finalScore);
    }, false);
    return;
  }

  stopProcessing();
}
