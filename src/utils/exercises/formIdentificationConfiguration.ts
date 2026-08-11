import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import { getVerbFormSelectionValidationMessages } from './verbFormStepCompatibility';

type RecordValue = Record<string, unknown>;

type PageLike = {
  items?: readonly unknown[];
};

export type FormIdentificationConfigurationIssue = {
  pageIndex: number;
  itemIndex: number;
  message: string;
};

const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null;

const getStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/**
 * Selected questions are authoritative. This only rejects a selected verb
 * form when it would produce no question at all.
 */
export function getGeneratedFormIdentificationConfigurationMessages(exercise: unknown): string[] {
  if (!isRecord(exercise) || exercise.type !== 'generated-form-identification' || !isRecord(exercise.data)) {
    return [];
  }

  const paradigmConfigs = exercise.data.paradigmConfigs;
  if (!isRecord(paradigmConfigs)) return [];

  const verbConfig = paradigmConfigs['verb-conjugation'];
  if (!isRecord(verbConfig) || verbConfig.enabled !== true || !isRecord(verbConfig.formSelection)) {
    return [];
  }

  const selectedCellPaths = getStringArray(verbConfig.formSelection.selectedCellPaths);
  const steps = getStringArray(verbConfig.steps) as FormIdentificationStep[];

  return getVerbFormSelectionValidationMessages(selectedCellPaths, steps);
}

export function getGeneratedFormIdentificationConfigurationIssues<T extends PageLike>(
  pages: readonly T[]
): FormIdentificationConfigurationIssue[] {
  return pages.flatMap((page, pageIndex) =>
    (page.items ?? []).flatMap((item, itemIndex) =>
      getGeneratedFormIdentificationConfigurationMessages(item).map(message => ({
        pageIndex,
        itemIndex,
        message,
      }))
    )
  );
}

export function formatFormIdentificationConfigurationIssue(issue: FormIdentificationConfigurationIssue): string {
  return `Morphology exercise ${issue.itemIndex + 1} on page ${issue.pageIndex + 1}: ${issue.message}`;
}
