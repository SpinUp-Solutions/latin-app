import type { Page } from '@/src/types/page';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import { normalizeVerbFormStepsForSelectedPaths } from './verbFormStepCompatibility';

const arraysEqual = <T,>(left: readonly T[], right: readonly T[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export function normalizeGeneratedFormIdentificationExercise(
  exercise: GeneratedFormIdentificationExercise
): GeneratedFormIdentificationExercise {
  const config = exercise.data.paradigmConfigs?.['verb-conjugation'];
  if (!config) return exercise;

  const normalizedSteps = normalizeVerbFormStepsForSelectedPaths(
    config.formSelection?.selectedCellPaths ?? [],
    config.steps
  );
  if (arraysEqual(config.steps, normalizedSteps)) return exercise;

  return {
    ...exercise,
    data: {
      ...exercise.data,
      paradigmConfigs: {
        ...exercise.data.paradigmConfigs,
        'verb-conjugation': {
          ...config,
          steps: normalizedSteps,
        },
      },
    },
  };
}

export function normalizeGeneratedFormIdentificationPages(pages: readonly Page[]): Page[] {
  let changed = false;
  const normalized = pages.map(page => {
    let pageChanged = false;
    const items = page.items.map(item => {
      if (item.type !== 'generated-form-identification') return item;
      const nextItem = normalizeGeneratedFormIdentificationExercise(item);
      if (nextItem !== item) pageChanged = true;
      return nextItem;
    });

    if (!pageChanged) return page;
    changed = true;
    return { ...page, items };
  });

  return changed ? normalized : (pages as Page[]);
}
