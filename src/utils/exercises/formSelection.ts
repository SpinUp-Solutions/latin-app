import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';

export const hasSelectedForm = (word: ExerciseWordResponse): boolean => {
  return (
    word.form_path !== null || (word.primary_form_paths?.length ?? 0) > 0 || (word.optional_form_paths?.length ?? 0) > 0
  );
};

export const getExerciseDisplayForm = (word: ExerciseWordResponse): string => {
  return hasSelectedForm(word) ? word.selected_form : word.dictionary_entry || word.selected_form;
};
