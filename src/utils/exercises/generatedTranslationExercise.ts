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

// Students often list several meanings ("he, she, it", "by/from", "he or she or it").
const ANSWER_LIST_SEPARATOR = /[,;/]|\bor\b/i;

export const validateGeneratedTranslationExercise = (userAnswer: string, currentItem: GeneratedTranslationItem) => {
  const shouldStripInfinitive = currentItem.stripInfinitive !== false;
  const shouldStripMacrons = currentItem.stripMacrons === true;
  const input = transformValue(userAnswer, shouldStripInfinitive, shouldStripMacrons);
  const normalizedAnswers = currentItem.acceptedAnswers.map(answer =>
    transformValue(answer, shouldStripInfinitive, shouldStripMacrons)
  );
  const listedAnswers = userAnswer
    .split(ANSWER_LIST_SEPARATOR)
    .map(part => transformValue(part, shouldStripInfinitive, shouldStripMacrons))
    .filter(Boolean);
  return {
    isCorrect:
      normalizedAnswers.includes(input) ||
      (listedAnswers.length > 1 && listedAnswers.every(answer => normalizedAnswers.includes(answer))),
  };
};
