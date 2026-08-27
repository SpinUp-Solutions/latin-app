import type { FormParadigm, ParadigmConfigs } from '@/src/types/exercises/paradigm';

interface PronounParadigmWord {
  part_of_speech?: unknown;
  pronoun_type?: unknown;
  person?: unknown;
}

const isPersonalFirstOrSecondPronoun = (word: PronounParadigmWord): boolean =>
  word.part_of_speech === 'pronoun' &&
  word.pronoun_type === 'personal' &&
  (word.person === '1st' || word.person === '2nd');

const hasBroadGenderedPronounOverlap = (paradigmConfigs: ParadigmConfigs): boolean => {
  const genderedConfig = paradigmConfigs['pronoun-gendered'];
  return Boolean(
    genderedConfig?.enabled && (!genderedConfig.filters.pronounType || genderedConfig.filters.pronounType === 'all')
  );
};

/**
 * Spec-aware overlap: 1st/2nd personal pronouns are ineligible only on the
 * broad gendered stream. The same lemma remains eligible on the personal stream.
 */
export const isRejectedBySpecAwarePronounOverlap = (
  word: PronounParadigmWord,
  specParadigm: FormParadigm | undefined,
  paradigmConfigs: ParadigmConfigs
): boolean =>
  hasBroadGenderedPronounOverlap(paradigmConfigs) &&
  specParadigm === 'pronoun-gendered' &&
  isPersonalFirstOrSecondPronoun(word);

/** Keeps the broad gendered-pronoun result from duplicating the personal-pronoun paradigm. */
export function filterOverlappingPronounParadigms<T extends PronounParadigmWord>(
  words: T[],
  paradigmConfigs: ParadigmConfigs
): T[] {
  if (!hasBroadGenderedPronounOverlap(paradigmConfigs)) return words;
  return words.filter(word => !isPersonalFirstOrSecondPronoun(word));
}
