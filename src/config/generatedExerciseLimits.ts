/**
 * Product ceiling for generated-exercise `count` (usable source words).
 * Chosen at/above the existing generated-words API page ceiling (200) and
 * typical authored values (default 5). `count: 'all'` is not subject to this cap.
 */
export const MAX_GENERATED_WORD_COUNT = 200;

/** Firestore `in` operand ceiling; comma-separated filter lists must stay within it. */
export const MAX_GENERATED_FILTER_OPERANDS = 30;
