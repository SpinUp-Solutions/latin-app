/** Authored fields in editor order, shared with the change review. Tables have their own schemas. */
export const WORD_FIELDS = {
  word: { label: 'Word' },
  type: { label: 'Word Type' },
  translation: { label: 'Translation', multiline: true },
  definitions: { label: 'Definitions' },
  etymology: { label: 'Etymology', multiline: true },
  pronunciation: { label: 'Pronunciation' },
  alternate_form: { label: 'Alternate Form' },
  dictionary_entry: { label: 'Dictionary Entry', placeholder: 'e.g., amō, amāre, amāvī, amātum' },
  gender: { label: 'Gender (optional)' },
  declension: { label: 'Declension' },
  nominative_singular: { label: 'Nominative Singular' },
  genitive_singular: { label: 'Genitive Singular' },
  pronoun_type: { label: 'Pronoun Type' },
  person: { label: 'Person' },
  conjugation: { label: 'Conjugation' },
  is_deponent: { label: 'Deponent' },
  principal_parts: { label: 'Principal Parts' },
  case: { label: 'Case' },
} as const;

export type WordFieldName = keyof typeof WORD_FIELDS;

export const WORD_FIELD_ROWS: Record<string, readonly (readonly WordFieldName[])[]> = {
  base: [
    ['word', 'type'],
    ['translation'],
    ['definitions'],
    ['etymology'],
    ['pronunciation'],
    ['alternate_form'],
    ['dictionary_entry'],
  ],
  noun: [
    ['gender', 'declension'],
    ['nominative_singular', 'genitive_singular'],
  ],
  pronoun: [['pronoun_type'], ['person']],
  adjective: [['declension']],
  verb: [['conjugation', 'is_deponent'], ['principal_parts']],
  preposition: [['case']],
};

export const wordFieldLabel = (name: string) =>
  name in WORD_FIELDS ? WORD_FIELDS[name as WordFieldName].label : name.replace(/_/g, ' ');

/** Fields the AI can report on that the form does not list, such as the inflection tables. */
const AI_ONLY_FIELD_LABELS: Record<string, string> = {
  declension_table: 'Declension table',
  conjugation_table: 'Conjugation table',
  degrees_table: 'Degrees table',
  dictionary_forms: 'Dictionary forms',
};

/** Short label for an AI review of a field. */
export const aiFieldLabel = (name: string) =>
  AI_ONLY_FIELD_LABELS[name] ?? wordFieldLabel(name).replace(/ \(optional\)$/, '');
