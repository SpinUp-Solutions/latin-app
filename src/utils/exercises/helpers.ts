/**
 * Helper utilities for exercise validation
 */

/**
 * Normalizes text for comparison by trimming whitespace and converting to lowercase
 */
export const normalizeText = (text: string): string => {
  return text.trim().toLowerCase();
};

/**
 * Checks if two normalized strings are equal
 */
export const isTextMatch = (userInput: string, correctAnswer: string): boolean => {
  return normalizeText(userInput) === normalizeText(correctAnswer);
};
