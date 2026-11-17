/**
 * Product ceiling for a numeric generated-exercise `count`. Unique-word mode repeats words in new forms until it
 * reaches `count`, so a number is never bounded by the source alone. `count: 'all'` uses every eligible source word
 * and is not subject to this cap.
 */
export const MAX_GENERATED_WORD_COUNT = 1000;

/** Firestore `in` operand ceiling; comma-separated filter lists must stay within it. */
export const MAX_GENERATED_FILTER_OPERANDS = 30;
