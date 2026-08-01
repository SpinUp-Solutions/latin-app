import type { Exercise } from '@/src/types/exercises';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';

const hasText = (value: string | undefined) => Boolean(value?.trim());
const hasRichText = (value: string | undefined) => Boolean(value?.replace(/<[^>]*>/g, '').trim());

const hasCompleteArray = (values: string[], expectedCount: number) =>
  expectedCount > 0 && values.length >= expectedCount && values.slice(0, expectedCount).every(value => hasText(value));

/**
 * Distinguishes a partially committed multi-step answer from a fully answered
 * exercise for test progress/review UI. Grading remains authoritative on the
 * server; this is only a student-facing completeness projection.
 */
export function isExerciseAnswerComplete(
  exercise: Exercise,
  answer: ExerciseAnswer | undefined,
  resolvedItemCount = 0
): boolean {
  if (!answer || answer.type !== exercise.type) return false;

  switch (exercise.type) {
    case 'matching': {
      if (answer.type !== 'matching') return false;
      const expectedMatches = exercise.data.expectedMatchCount ?? exercise.data.leftColumn.length;
      const expectedRounds = exercise.data.requiredRepetitions ?? 1;
      return (
        answer.rounds.length >= expectedRounds &&
        answer.rounds.slice(0, expectedRounds).every(round => Object.keys(round).length >= expectedMatches)
      );
    }
    case 'fill':
      return answer.type === 'fill' && hasCompleteArray(answer.answers, exercise.data.items.length);
    case 'multiple-choice':
      return answer.type === 'multiple-choice' && answer.selectedOptionIds.length > 0;
    case 'odd-one-out':
      return (
        answer.type === 'odd-one-out' &&
        hasText(answer.selectedItemId) &&
        (!exercise.data.requireExplanation || hasRichText(answer.explanation))
      );
    case 'text-selection':
      return (
        answer.type === 'text-selection' &&
        exercise.data.questions.length > 0 &&
        answer.selectedWordIndices.length >= exercise.data.questions.length &&
        answer.selectedWordIndices
          .slice(0, exercise.data.questions.length)
          .every(index => Number.isInteger(index) && index >= 0)
      );
    case 'fill-embolded-text':
      return answer.type === 'fill-embolded-text' && hasCompleteArray(answer.answers, exercise.data.words.length);
    case 'table-fill': {
      if (answer.type !== 'table-fill') return false;
      const expectedCells = exercise.data.rows.reduce(
        (count, row) => count + Object.values(row.cells).filter(cell => cell.isBlank).length,
        0
      );
      return expectedCells > 0 && Object.values(answer.answers).filter(value => hasText(value)).length >= expectedCells;
    }
    case 'click-on-multiple-words':
      // This component emits only from its explicit Submit action, so an empty
      // selection is still an intentional committed answer.
      return answer.type === 'click-on-multiple-words';
    case 'generated-translation':
      return answer.type === 'generated-translation' && hasCompleteArray(answer.answers, resolvedItemCount);
    case 'generated-form-identification':
      return (
        answer.type === 'generated-form-identification' &&
        resolvedItemCount > 0 &&
        Object.values(answer.answers).filter(value => hasText(value)).length >= resolvedItemCount
      );
    case 'sentence-diagramming':
      return answer.type === 'sentence-diagramming' && answer.annotations.length > 0;
    default:
      return false;
  }
}
