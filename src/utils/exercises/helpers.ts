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

const RICH_TEXT_BOUNDARY_TAGS =
  /<\s*\/?\s*(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  copy: '©',
  euro: '€',
  gt: '>',
  hellip: '…',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  pound: '£',
  quot: '"',
  rdquo: '”',
  reg: '®',
  rsquo: '’',
  yen: '¥',
};

const decodeHtmlEntity = (match: string, entity: string): string => {
  if (!entity.startsWith('#')) return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? match;

  const hexadecimal = entity[1]?.toLowerCase() === 'x';
  const digits = entity.slice(hexadecimal ? 2 : 1);
  const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
  if (
    !Number.isInteger(codePoint) ||
    codePoint <= 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return match;
  }
  return String.fromCodePoint(codePoint);
};

/**
 * Converts editor-authored rich text into a compact prompt-safe string.
 * Block boundaries become spaces so adjacent phrases cannot merge, while
 * common named entities and all valid numeric entities are decoded.
 */
export const richTextToPlainText = (text: string): string =>
  text
    .replace(RICH_TEXT_BOUNDARY_TAGS, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/gi, decodeHtmlEntity)
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Normalizes text for comparison by stripping HTML, trimming whitespace and converting to lowercase
 */
export const normalizeText = (text: string): string => {
  return stripHtmlTags(text).trim().toLowerCase();
};

/**
 * Strips macrons from Latin text (e.g., ā -> a)
 */
export const stripMacrons = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0304]/g, '')
    .normalize('NFC');
};

/**
 * Checks if two normalized strings are equal
 * Handles both plain text and HTML content (from rich text editors)
 */
export const isTextMatch = (userInput: string, correctAnswer: string): boolean => {
  return normalizeText(userInput) === normalizeText(correctAnswer);
};
