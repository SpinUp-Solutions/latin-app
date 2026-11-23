import { stripMacrons } from '@/src/utils/exercises/helpers';

/** The equality index for duplicate checks. The sort key belongs to list ordering and prefix search. */
export const HEADWORD_KEY_FIELD = '_headwordKey';

/** Match spelling regardless of capitals, macrons and surrounding whitespace. */
export const canonicalHeadwordKey = (word: unknown): string =>
  typeof word === 'string' ? stripMacrons(word.trim()).toLowerCase() : '';
