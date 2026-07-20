import type { ParadigmConfigs } from '@/src/types/exercises/paradigm';

interface PronounParadigmWord {
  part_of_speech?: unknown;
  pronoun_type?: unknown;
  person?: unknown;
}

/** Keeps the broad gendered-pronoun result from duplicating the personal-pronoun paradigm. */
export function filterOverlappingPronounParadigms<T extends PronounParadigmWord>(
  words: T[],
  paradigmConfigs: ParadigmConfigs
): T[] {
  const genderedConfig = paradigmConfigs['pronoun-gendered'];
  const broadGenderedPronouns =
    genderedConfig?.enabled && (!genderedConfig.filters.pronounType || genderedConfig.filters.pronounType === 'all');
  if (!broadGenderedPronouns) return words;

  return words.filter(
    word =>
      !(
        word.part_of_speech === 'pronoun' &&
        word.pronoun_type === 'personal' &&
        (word.person === '1st' || word.person === '2nd')
      )
  );
}
