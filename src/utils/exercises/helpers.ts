/**
 * Helper utilities for exercise validation
 */

/**
 * Strips HTML tags from text content
 * This handles content from rich text editors that may contain HTML
 */
export const stripHtmlTags = (text: string): string => {
  if (typeof window !== 'undefined') {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    return tempDiv.textContent || tempDiv.innerText || '';
  }

  // Fallback for server-side: basic HTML tag removal
  return text.replace(/<[^>]*>/g, '');
};

/**
 * Normalizes text for comparison by stripping HTML, trimming whitespace and converting to lowercase
 */
export const normalizeText = (text: string): string => {
  return stripHtmlTags(text).trim().toLowerCase();
};

/**
 * Checks if two normalized strings are equal
 * Handles both plain text and HTML content (from rich text editors)
 */
export const isTextMatch = (userInput: string, correctAnswer: string): boolean => {
  return normalizeText(userInput) === normalizeText(correctAnswer);
};
