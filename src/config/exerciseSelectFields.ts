export const EXERCISE_SELECT_FIELDS = {
  'generated-translation': ['translation'],
} as const;

export type GeneratedExerciseType = keyof typeof EXERCISE_SELECT_FIELDS;

export const getExerciseAdditionalFields = (exerciseType: GeneratedExerciseType): readonly string[] => {
  return EXERCISE_SELECT_FIELDS[exerciseType];
};
