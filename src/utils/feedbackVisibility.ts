import type { FeedbackLevel } from '@/src/types/exercises/base';

export function hasVisibleFeedbackContent(content: unknown): boolean {
  if (typeof content === 'string') {
    // An editor's empty paragraph is `<p>&nbsp;</p>`, which renders as nothing.
    return (
      content
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;|&#(?:160|x0*a0);/gi, ' ')
        .trim() !== ''
    );
  }

  return Boolean(content);
}

/** Whether incorrect-answer feedback at this level puts the hint or the correct answer on screen. */
export function revealsHintOrAnswer(
  level: FeedbackLevel | null | undefined,
  hint: unknown,
  correctAnswer: unknown
): boolean {
  return (
    (Boolean(level?.showHint) && hasVisibleFeedbackContent(hint)) ||
    (Boolean(level?.showAnswer) && hasVisibleFeedbackContent(correctAnswer))
  );
}
