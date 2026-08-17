import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { FormParadigm, ParadigmConfigs } from '@/src/types/exercises/paradigm';
import { PARADIGM_TABLE_TYPE } from '@/src/config/paradigmDefinitions';
import { buildLegacyParadigmConfigs } from './legacyExerciseCompat';
import {
  getCompatibilityStepLabels,
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

export type FormIdentificationConfigurationWarning = {
  paradigm: FormParadigm;
  label: string;
  skippedCount: number;
  selectedCount: number;
  answerableCount: number;
  supportedSteps: readonly FormIdentificationStep[];
  kind: 'incompatible' | 'unrecognized';
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

export function getGeneratedFormIdentificationConfigurationSummaries(exercise: unknown): Array<{
  paradigm: FormParadigm;
  summary: FormIdentificationCompatibilitySummary;
}> {
  if (!isRecord(exercise) || exercise.type !== 'generated-form-identification' || !isRecord(exercise.data)) return [];
  const configs = getEffectiveParadigmConfigs(exercise.data);
  return (Object.keys(PARADIGM_TABLE_TYPE) as FormParadigm[]).flatMap(paradigm => {
    const summary = getSummaryForConfig(paradigm, configs[paradigm]);
    return summary ? [{ paradigm, summary }] : [];
  });
}

/** Partial incompatibility is informational; only an entirely unusable paradigm is blocking. */
export function getGeneratedFormIdentificationConfigurationMessages(exercise: unknown): string[] {
  const summaries = getGeneratedFormIdentificationConfigurationSummaries(exercise);
  const answerableCount = summaries.reduce((total, { summary }) => total + summary.answerableCount, 0);
  if (answerableCount > 0) return [];
  return summaries
    .filter(({ summary }) => summary.selectedCount > 0)
    .map(({ summary }) => {
      if (summary.unknownPaths.length > 0) {
        return summary.skipped.length > 0
          ? 'No answerable selected forms remain. Add a compatible question or select valid forms before saving.'
          : 'Saved form selections are unrecognized. Select valid forms before saving.';
      }
      return `${summary.skipped[0]?.support.label ?? 'Selected forms'} have no applicable selected questions.`;
    });
}

export function getGeneratedFormIdentificationConfigurationWarnings(
  exercise: unknown
): FormIdentificationConfigurationWarning[] {
  const summaries = getGeneratedFormIdentificationConfigurationSummaries(exercise);
  const answerableCount = summaries.reduce((total, { summary }) => total + summary.answerableCount, 0);
  if (answerableCount === 0) return [];
  return summaries.flatMap(({ paradigm, summary }) => {
    if (summary.skipped.length === 0 && summary.unknownPaths.length === 0) return [];
    const groups = new Map<string, FormIdentificationConfigurationWarning>();
    summary.skipped.forEach(selection => {
      const existing = groups.get(selection.support.label);
      if (existing) {
        existing.skippedCount += 1;
        selection.support.supportedSteps.forEach(step => {
          if (!existing.supportedSteps.includes(step)) {
            existing.supportedSteps = [...existing.supportedSteps, step];
          }
        });
        return;
      }
      groups.set(selection.support.label, {
        paradigm,
        label: selection.support.label,
        skippedCount: 1,
        selectedCount: summary.selectedCount,
        answerableCount: summary.answerableCount,
        supportedSteps: [...selection.support.supportedSteps],
        kind: 'incompatible',
      });
    });
    const warnings = Array.from(groups.values());
    if (summary.unknownPaths.length > 0) {
      warnings.push({
        paradigm,
        label: 'Unrecognized saved forms',
        skippedCount: summary.unknownPaths.length,
        selectedCount: summary.selectedCount,
        answerableCount: summary.answerableCount,
        supportedSteps: [],
        kind: 'unrecognized',
      });
    }
    return warnings;
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

export function formatFormIdentificationConfigurationWarning(warning: FormIdentificationConfigurationWarning): string {
  if (warning.kind === 'unrecognized') {
    const formLabel = warning.skippedCount === 1 ? 'form' : 'forms';
    return `${warning.skippedCount} unrecognized saved ${formLabel} will be skipped. Select a valid form or remove the selection.`;
  }

  const label = warning.label.toLowerCase().replace(/ forms$/, warning.skippedCount === 1 ? ' form' : ' forms');
  const pronoun = warning.skippedCount === 1 ? 'it' : 'them';
  return `${warning.skippedCount} ${label} will not appear because none of the selected questions apply. Add ${getCompatibilityStepLabels(warning.supportedSteps)} to include ${pronoun}.`;
}
