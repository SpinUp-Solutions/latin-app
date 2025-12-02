export const EXERCISE_SELECT_FIELDS = {
  'generated-translation': ['translation'],
  'generated-form-identification': ['form_path', 'conjugation', 'declension', 'gender', 'is_deponent'],
} as const;

export type GeneratedExerciseType = keyof typeof EXERCISE_SELECT_FIELDS;

export const getExerciseAdditionalFields = (exerciseType: GeneratedExerciseType): readonly string[] => {
  return EXERCISE_SELECT_FIELDS[exerciseType];
};
