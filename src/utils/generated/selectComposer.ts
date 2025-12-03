import type { FormSelection } from '@/src/types/exercises/base';

const BASE_FIELDS = ['word', 'part_of_speech', 'dictionary_entry'] as const;
const TABLE_FIELDS = ['conjugation_table', 'declension_table', 'degrees_table'] as const;

export interface SelectComposerOptions {
  formSelection?: FormSelection;
}

export const composeSelectFields = (
  additionalFields: readonly string[],
  options: SelectComposerOptions = {}
): string[] => {
  const unique = new Set<string>([...BASE_FIELDS, ...additionalFields]);

  if (options.formSelection) {
    for (const tableField of TABLE_FIELDS) {
      unique.add(tableField);
    }
  }

  return Array.from(unique);
};
