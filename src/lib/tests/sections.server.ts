import { createHash } from 'node:crypto';
import type { InProgressTestAttempt } from '@/src/types/test';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import type { Exercise } from '@/src/types/exercises';
import { isExerciseType } from '@/src/lib/content/registry';
import { richTextToPlainText } from '@/src/utils/exercises/helpers';
import { getTranslationGradingTask } from '@/shared/openai/translation-grading-tasks';
import { TestServiceError } from './errors';
import { isExerciseAnswerComplete } from './answer-completion';
import { sanitizeTestDeliveryState, type FrozenTestDeliveryState } from './delivery';

export const fingerprint = (value: unknown): string => {
  const stable = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(stable)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.entries(input)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, v]) => [key, stable(v)])
          )
        : input;
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
};

export function activeSection(attempt: InProgressTestAttempt) {
  if (attempt.flowVersion !== 1 || !attempt.sections)
    throw new TestServiceError('ATTEMPT_SECTION_REQUIRED', 'This attempt does not use sections', 409);
  const pageIndex = attempt.deliveryState.pages.findIndex(page => attempt.sections![page.id].phase !== 'confirmed');
  const page = attempt.deliveryState.pages[pageIndex];
  if (!page) throw new TestServiceError('STALE_TEST_ATTEMPT_DATA', 'The active section is unavailable', 409);
  return { page, pageIndex, state: attempt.sections[page.id] };
}

export function assertActiveSection(attempt: InProgressTestAttempt, pageId: string, revision: number) {
  const active = activeSection(attempt);
  if (active.page.id !== pageId)
    throw new TestServiceError(
      'ATTEMPT_SECTION_LOCKED',
      'This section is locked or not yet available. Reload your attempt.',
      409
    );
  if (active.state.revision !== revision)
    throw new TestServiceError(
      'ATTEMPT_REVISION_CONFLICT',
      'This section changed in another tab. Reload the saved answers before continuing.',
      409
    );
  return active;
}

export function sectionFingerprint(attempt: InProgressTestAttempt, pageId: string) {
  const page = attempt.deliveryState.pages.find(page => page.id === pageId)!;
  return fingerprint({
    page,
    answers: page.items.map(item => [item.id, attempt.answers[item.id] ?? null]),
    promptVersion: getTranslationGradingTask('test').promptVersion,
  });
}

export function sectionIncomplete(attempt: InProgressTestAttempt, pageId: string) {
  // Use the same public shape as the client (e.g. legacy matching orphan counts).
  const delivery = sanitizeTestDeliveryState(attempt.deliveryState as FrozenTestDeliveryState);
  return delivery.pages
    .find(page => page.id === pageId)!
    .items.some(
      item =>
        isExerciseType(item.type) &&
        !isExerciseAnswerComplete(
          item as Exercise,
          attempt.answers[item.id],
          delivery.resolvedExercises[item.id]?.items.length ?? 0
        )
    );
}

export function translationsToGrade(attempt: InProgressTestAttempt, pageId: string) {
  return attempt.deliveryState.pages
    .find(page => page.id === pageId)!
    .items.flatMap(exercise => {
      if (exercise.type !== 'translation-grading') return [];
      const answer = attempt.answers[exercise.id];
      return (exercise as Extract<Exercise, { type: 'translation-grading' }>).data.items.flatMap((item, itemIndex) => {
        const translation = answer?.type === 'translation-grading' ? answer.translations[itemIndex]?.trim() : '';
        if (!translation || attempt.translationGrades[exercise.id]?.[String(itemIndex)]?.translation === translation)
          return [];
        return [
          {
            exerciseId: exercise.id,
            itemIndex,
            translation,
            request: {
              sourceText: richTextToPlainText(item.latinText),
              userTranslation: translation,
              direction: exercise.translationDirection ?? 'latin-to-english',
            },
          },
        ];
      });
    });
}

/** Validate public references, never correctness. Empty fields remain legal drafts. */
export function validateSectionAnswer(exercise: Exercise, answer: ExerciseAnswer, resolved: unknown[] = []) {
  const invalid = () => {
    throw new TestServiceError(
      'ATTEMPT_ANSWER_INVALID',
      'An answer references a question or option outside this section',
      400
    );
  };
  const ids = (values: string[], allowed: string[]) => {
    if (new Set(values).size !== values.length || values.some(value => !allowed.includes(value))) invalid();
  };
  const array = (values: unknown[], length: number) => {
    if (values.length > length) invalid();
  };
  switch (answer.type) {
    case 'fill':
      if (exercise.type === 'fill') array(answer.answers, exercise.data.items.length);
      break;
    case 'fill-embolded-text':
      if (exercise.type === 'fill-embolded-text') array(answer.answers, exercise.data.words.length);
      break;
    case 'translation-grading':
      if (exercise.type === 'translation-grading') {
        array(answer.translations, exercise.data.items.length);
        if (answer.translations.some(text => text.length > 10_000)) invalid();
      }
      break;
    case 'generated-translation':
      array(answer.answers, resolved.length);
      break;
    case 'generated-form-identification':
      ids(
        Object.keys(answer.answers),
        resolved.map(item => (item as { id: string }).id)
      );
      break;
    case 'multiple-choice':
      if (exercise.type === 'multiple-choice')
        ids(
          answer.selectedOptionIds,
          exercise.data.options.map(o => o.id)
        );
      break;
    case 'odd-one-out':
      if (exercise.type === 'odd-one-out' && answer.selectedItemId)
        ids(
          [answer.selectedItemId],
          exercise.data.items.map(i => i.id)
        );
      break;
    case 'matching':
      if (exercise.type === 'matching') {
        array(answer.rounds, exercise.data.requiredRepetitions ?? 1);
        for (const round of answer.rounds) {
          ids(
            Object.keys(round),
            exercise.data.leftColumn.map(i => i.id)
          );
          ids(
            Object.values(round),
            exercise.data.rightColumn.map(i => i.id)
          );
        }
      }
      break;
    case 'table-fill':
      if (exercise.type === 'table-fill')
        ids(
          Object.keys(answer.answers),
          exercise.data.rows.flatMap(row =>
            exercise.data.columns.flatMap(column => (row.cells[column.id]?.isBlank ? [`${row.id}-${column.id}`] : []))
          )
        );
      break;
    case 'text-selection':
      if (exercise.type === 'text-selection') {
        array(answer.selectedWordIndices, exercise.data.questions.length);
        const count = richTextToPlainText(exercise.data.passage.replace(/<[^>]*>/g, '')).split(/\s+/).length;
        if (answer.selectedWordIndices.some(i => i < -1 || i >= count)) invalid();
      }
      break;
    case 'click-on-multiple-words':
      if (exercise.type === 'click-on-multiple-words') {
        const count = richTextToPlainText(exercise.data.passage.replace(/<[^>]*>/g, '')).split(/\s+/).length;
        if (
          new Set(answer.selectedWordIndices).size !== answer.selectedWordIndices.length ||
          answer.selectedWordIndices.some(i => i >= count)
        )
          invalid();
      }
      break;
    case 'sentence-diagramming':
      if (exercise.type === 'sentence-diagramming') {
        if (new Set(answer.annotations.map(a => a.id)).size !== answer.annotations.length) invalid();
        for (const { span } of answer.annotations) {
          const start = exercise.data.tokens[span.startTokenIndex];
          const end = exercise.data.tokens[span.endTokenIndex];
          if (
            !start ||
            !end ||
            span.endTokenIndex < span.startTokenIndex ||
            span.startCharOffset > start.text.length ||
            span.endCharOffset > end.text.length ||
            (span.startTokenIndex === span.endTokenIndex && span.endCharOffset <= span.startCharOffset)
          )
            invalid();
        }
      }
      break;
  }
}
