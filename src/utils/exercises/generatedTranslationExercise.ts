import { ValidationResult } from './types';
import { stripHtmlTags, stripMacrons } from './helpers';

export interface GeneratedTranslationItem {
  text: string;
  acceptedAnswers: string[];
  hint?: string;
  stripInfinitive?: boolean;
  stripMacrons?: boolean;
}

export const splitTranslationAnswers = (value?: string | null): string[] => {
  if (!value) return [];

  return value
    .replace(/\([^)]*\)/g, '')
    .split(/[;,]/)
    .map(part => part.trim())
    .filter(Boolean);
};

const normalize = (s: string, shouldStripMacrons: boolean): string => {
  const normalized = stripHtmlTags(s)
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]/g, '')
    .replace(/\s+/g, ' ');
  return shouldStripMacrons ? stripMacrons(normalized) : normalized;
};

const stripInfinitive = (s: string): string => {
  return s.replace(/^to\s+/, '');
};

const transformValue = (value: string, shouldStripInfinitive: boolean, shouldStripMacrons: boolean): string => {
  const normalized = normalize(value, shouldStripMacrons);
  return shouldStripInfinitive ? stripInfinitive(normalized) : normalized;
};

export const validateGeneratedTranslationExercise = (
  userAnswer: string,
  currentItem: GeneratedTranslationItem
): ValidationResult => {
  const shouldStripInfinitive = currentItem.stripInfinitive !== false;
  const shouldStripMacrons = currentItem.stripMacrons === true;
  const input = transformValue(userAnswer, shouldStripInfinitive, shouldStripMacrons);
  const normalizedAnswers = currentItem.acceptedAnswers.map(answer =>
    transformValue(answer, shouldStripInfinitive, shouldStripMacrons)
  );
  const isCorrect = normalizedAnswers.includes(input);

  return {
    isCorrect,
    correctAnswer: currentItem.acceptedAnswers.join(', '),
    hint: currentItem.hint,
  };
};
