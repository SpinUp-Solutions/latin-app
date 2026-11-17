import type { NounStructuredOutput, VerbStructuredOutput } from '@/shared/types/vocabulary/ai';

export const commonOutput = {
  translation: 'and',
  definitions: ['and; also'],
  etymology: null,
  pronunciation: null,
  alternate_form: null,
  uncertainties: [],
  review_answer: null,
};

export const nounOutput = (): NounStructuredOutput => ({
  ...commonOutput,
  translation: 'king',
  definitions: ['A king or ruler.'],
  gender: 'masculine',
  declension: '3',
  nominative_singular: { full_form: 'rēx', shortened_form: 'rēx' },
  genitive_singular: { full_form: 'rēgis', shortened_form: 'rēgis' },
  declension_table: {
    nominative: { singular: ['rēx'], plural: ['rēgēs'] },
    genitive: { singular: ['rēgis'], plural: ['rēgum'] },
    dative: { singular: ['rēgī'], plural: ['rēgibus'] },
    accusative: { singular: ['rēgem'], plural: ['rēgēs'] },
    ablative: { singular: ['rēge'], plural: ['rēgibus'] },
    vocative: { singular: ['rēx'], plural: ['rēgēs'] },
    locative: { singular: null, plural: null },
  },
});

const numbers = () => ({
  singular: { first: null, second: null, third: null },
  plural: { first: null, second: null, third: null },
});
const indicative = () => ({
  present: numbers(),
  imperfect: numbers(),
  future: numbers(),
  perfect: numbers(),
  pluperfect: numbers(),
  future_perfect: numbers(),
});
const subjunctive = () => ({ present: numbers(), imperfect: numbers(), perfect: numbers(), pluperfect: numbers() });
const presentImperative = () => ({ singular: { second: null }, plural: { second: null } });
const infinitive = () => ({ active: null, passive: null });
/** Complete transport fixture: null cells test the nullable paradigm contract. */
export const verbOutput = (): VerbStructuredOutput => ({
  ...commonOutput,
  translation: 'carry',
  definitions: ['To carry.'],
  conjugation: 'irregular',
  is_deponent: false,
  principal_parts: [
    { full_form: 'ferō', shortened_form: 'ferō' },
    { full_form: 'ferre', shortened_form: 'ferre' },
    { full_form: 'tulī', shortened_form: 'tulī' },
    { full_form: 'lātum', shortened_form: 'lātum' },
  ],
  conjugation_table: {
    indicative: { active: indicative(), passive: indicative() },
    subjunctive: { active: subjunctive(), passive: subjunctive() },
    imperative: {
      active: {
        present: presentImperative(),
        future: { singular: { second: null, third: null }, plural: { second: null, third: null } },
      },
      passive: { present: presentImperative(), future: { singular: { third: null }, plural: { third: null } } },
    },
    nonFinite: {
      infinitive: { present: infinitive(), perfect: infinitive(), future: infinitive() },
      participle: { present: { active: null }, perfect: { passive: null }, future: { active: null, passive: null } },
    },
    gerund: { genitive: null, dative: null, accusative: null, ablative: null },
    supine: { accusative: null, ablative: null },
  },
});

export const completedResponse = (output: unknown) => ({
  model: 'gpt-6.1-terra',
  status: 'completed',
  output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
  usage: { input_tokens: 1000, output_tokens: 1000, total_tokens: 2000 },
});
