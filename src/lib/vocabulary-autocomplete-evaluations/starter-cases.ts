import type { VocabularyEvaluationCaseInput } from './contracts';

/**
 * Ready-made cases. Verbs come first: a full conjugation with every
 * participle table is the longest output autocomplete produces, so it is
 * where a model runs out of output tokens or time first.
 */
export const STARTER_VOCABULARY_EVALUATION_CASES: VocabularyEvaluationCaseInput[] = [
  {
    title: 'Irregular verb: ferō',
    entries: [{ id: 'fero', word: 'ferō', partOfSpeech: 'verb' }],
  },
  {
    title: 'Deponent verb: sequor',
    entries: [{ id: 'sequor', word: 'sequor', partOfSpeech: 'verb' }],
  },
  {
    title: 'Regular verbs: amō, capiō',
    entries: [
      { id: 'amo', word: 'amō', partOfSpeech: 'verb' },
      { id: 'capio', word: 'capiō', partOfSpeech: 'verb' },
    ],
  },
  {
    title: 'Nouns: rēx, mare, rēs',
    entries: [
      { id: 'rex', word: 'rēx', partOfSpeech: 'noun' },
      { id: 'mare', word: 'mare', partOfSpeech: 'noun' },
      { id: 'res', word: 'rēs', partOfSpeech: 'noun' },
    ],
  },
  {
    title: 'Adjective and pronoun: ācer, hic',
    entries: [
      { id: 'acer', word: 'ācer', partOfSpeech: 'adjective' },
      { id: 'hic', word: 'hic', partOfSpeech: 'pronoun' },
    ],
  },
  {
    title: 'Indeclinables: saepe, ad, et',
    entries: [
      { id: 'saepe', word: 'saepe', partOfSpeech: 'adverb' },
      { id: 'ad', word: 'ad', partOfSpeech: 'preposition' },
      { id: 'et', word: 'et', partOfSpeech: 'conjunction' },
    ],
  },
];
