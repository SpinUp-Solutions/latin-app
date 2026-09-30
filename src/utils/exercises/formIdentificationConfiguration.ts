import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { FormParadigm, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import { PARADIGM_TABLE_TYPE } from '@/src/config/paradigmDefinitions';
import { buildLegacyParadigmConfigs } from './legacyExerciseCompat';
import {
  getFormIdentificationCompatibilitySummary,
  type FormIdentificationCompatibilitySummary,
} from './formIdentificationCompatibility';

type RecordValue = Record<string, unknown>;
type PageLike = { items?: readonly unknown[] };

export type FormIdentificationConfigurationIssue = {
  pageIndex: number;
  itemIndex: number;
  message: string;
};

const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null;
const getStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const getEffectiveParadigmConfigs = (data: RecordValue): ParadigmConfigs => {
  if (isRecord(data.paradigmConfigs) && Object.keys(data.paradigmConfigs).length > 0) {
    return data.paradigmConfigs as ParadigmConfigs;
  }
  return buildLegacyParadigmConfigs(data.generatorConfig as Parameters<typeof buildLegacyParadigmConfigs>[0]);
};

const getSummaryForConfig = (
  paradigm: FormParadigm,
  config: unknown
): FormIdentificationCompatibilitySummary | null => {
  if (!isRecord(config) || config.enabled !== true || !isRecord(config.formSelection)) return null;
  const selectedPaths = getStringArray(config.formSelection.selectedCellPaths);
  if (selectedPaths.length === 0) return null;
  const steps = getStringArray(config.steps) as FormIdentificationStep[];
  return getFormIdentificationCompatibilitySummary(PARADIGM_TABLE_TYPE[paradigm], selectedPaths, steps);
};

function getConfigurationSummaries(exercise: unknown): FormIdentificationCompatibilitySummary[] {
  if (!isRecord(exercise) || exercise.type !== 'generated-form-identification' || !isRecord(exercise.data)) return [];
  const configs = getEffectiveParadigmConfigs(exercise.data);
  return (Object.keys(PARADIGM_TABLE_TYPE) as FormParadigm[]).flatMap(
    paradigm => getSummaryForConfig(paradigm, configs[paradigm]) ?? []
  );
}

/** Partial incompatibility is informational; only an entirely unusable paradigm is blocking. */
export function getGeneratedFormIdentificationConfigurationMessages(exercise: unknown): string[] {
  const summaries = getConfigurationSummaries(exercise);
  if (summaries.some(summary => summary.answerableCount > 0)) return [];
  return summaries.map(summary => {
    if (summary.unknownPaths.length > 0) {
      return summary.skipped.length > 0
        ? 'No answerable selected forms remain. Add a compatible question or select valid forms before saving.'
        : 'Saved form selections are unrecognized. Select valid forms before saving.';
    }
    return `${summary.skipped[0]?.support.label ?? 'Selected forms'} have no applicable selected questions.`;
  });
}

export function getGeneratedFormIdentificationConfigurationIssues<T extends PageLike>(
  pages: readonly T[]
): FormIdentificationConfigurationIssue[] {
  return pages.flatMap((page, pageIndex) =>
    (page.items ?? []).flatMap((item, itemIndex) =>
      getGeneratedFormIdentificationConfigurationMessages(item).map(message => ({ pageIndex, itemIndex, message }))
    )
  );
}

export function formatFormIdentificationConfigurationIssue(issue: FormIdentificationConfigurationIssue): string {
  return `Morphology exercise ${issue.itemIndex + 1} on page ${issue.pageIndex + 1}: ${issue.message}`;
}
