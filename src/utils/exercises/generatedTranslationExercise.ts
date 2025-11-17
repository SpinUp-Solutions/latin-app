import { ValidationResult } from './types';
import { stripHtmlTags } from './helpers';

export interface GeneratedTranslationItem {
  text: string;
  acceptedAnswers: string[];
  hint?: string;
  stripInfinitive?: boolean;
}

const normalize = (s: string): string => {
  return stripHtmlTags(s)
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]/g, '')
    .replace(/\s+/g, ' ');
};

const stripInfinitive = (s: string): string => {
  return s.replace(/^to\s+/, '');
};

const transformValue = (value: string, shouldStripInfinitive: boolean): string => {
  const normalized = normalize(value);
  return shouldStripInfinitive ? stripInfinitive(normalized) : normalized;
};

export const validateGeneratedTranslationExercise = (
  userAnswer: string,
  currentItem: GeneratedTranslationItem
): ValidationResult => {
  const shouldStripInfinitive = currentItem.stripInfinitive !== false;
  const input = transformValue(userAnswer, shouldStripInfinitive);
  const normalizedAnswers = currentItem.acceptedAnswers.map(answer => transformValue(answer, shouldStripInfinitive));
  const isCorrect = normalizedAnswers.includes(input);

  console.log('[Validation Debug]', {
    userAnswer,
    input,
    acceptedAnswers: currentItem.acceptedAnswers,
    normalizedAnswers,
    isCorrect,
  });

  return {
    isCorrect,
    correctAnswer: currentItem.acceptedAnswers.join(', '),
    hint: currentItem.hint,
  };
};
