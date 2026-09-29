import { normalizeAnswer, stripMacrons } from './helpers';

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

const transformValue = (value: string, shouldStripInfinitive: boolean, shouldStripMacrons: boolean): string => {
  const normalized = shouldStripMacrons ? stripMacrons(normalizeAnswer(value)) : normalizeAnswer(value);
  return shouldStripInfinitive ? normalized.replace(/^to\s+/, '') : normalized;
};

export const validateGeneratedTranslationExercise = (userAnswer: string, currentItem: GeneratedTranslationItem) => {
  const shouldStripInfinitive = currentItem.stripInfinitive !== false;
  const shouldStripMacrons = currentItem.stripMacrons === true;
  const input = transformValue(userAnswer, shouldStripInfinitive, shouldStripMacrons);
  return {
    isCorrect: currentItem.acceptedAnswers.some(
      answer => transformValue(answer, shouldStripInfinitive, shouldStripMacrons) === input
    ),
  };
};
