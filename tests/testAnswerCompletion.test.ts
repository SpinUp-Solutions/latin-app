import { isExerciseAnswerComplete } from '@/src/lib/tests/answer-completion';
import type { FillExercise, GeneratedTranslationExercise, MatchingExercise } from '@/src/types/exercises';

const base = {
  title: 'Exercise',
  instructions: '',
  feedbackConfig: { escalationLevels: [] },
};

describe('test answer completeness', () => {
  it('does not count a partially answered multi-item fill exercise', () => {
    const exercise: FillExercise = {
      ...base,
      id: 'fill',
      type: 'fill',
      data: {
        items: [
          { text: 'amo', answer: 'love' },
          { text: 'video', answer: 'see' },
        ],
      },
    };

    expect(isExerciseAnswerComplete(exercise, { type: 'fill', answers: ['love'] })).toBe(false);
    expect(isExerciseAnswerComplete(exercise, { type: 'fill', answers: ['love', 'see'] })).toBe(true);
  });

  it('requires every configured matching round to be complete', () => {
    const exercise: MatchingExercise = {
      ...base,
      id: 'matching',
      type: 'matching',
      data: {
        leftColumn: [
          { id: 'left-a', value: 'A' },
          { id: 'left-b', value: 'B' },
        ],
        rightColumn: [
          { id: 'right-a', value: '1' },
          { id: 'right-b', value: '2' },
        ],
        answers: { 'left-a': 'right-a', 'left-b': 'right-b' },
        requiredRepetitions: 2,
      },
    };
    const completeRound = { 'left-a': 'right-a', 'left-b': 'right-b' };

    expect(isExerciseAnswerComplete(exercise, { type: 'matching', rounds: [completeRound] })).toBe(false);
    expect(
      isExerciseAnswerComplete(exercise, {
        type: 'matching',
        rounds: [completeRound, completeRound],
      })
    ).toBe(true);
  });

  it('uses frozen generated-item count for generated exercise completion', () => {
    const exercise = {
      ...base,
      id: 'generated',
      type: 'generated-translation' as const,
      translationDirection: 'latin-to-english' as const,
      data: {
        generatorConfig: {
          collection: 'words',
          wordSource: 'filters',
          count: 2,
        },
        posConfigs: {},
      },
    } as GeneratedTranslationExercise;

    expect(isExerciseAnswerComplete(exercise, { type: 'generated-translation', answers: ['first'] }, 2)).toBe(false);
  });
});
