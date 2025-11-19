import { ValidationResult } from './types';
import { stripHtmlTags } from './helpers';

interface GeneratedTranslationItem {
  text: string;
  acceptedAnswers: string[];
  hint?: string;
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

export const validateGeneratedTranslationExercise = (
  userAnswer: string,
  currentItem: GeneratedTranslationItem
): ValidationResult => {
  const input = stripInfinitive(normalize(userAnswer));
  const normalizedAnswers = currentItem.acceptedAnswers.map(a => stripInfinitive(normalize(a)));
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
