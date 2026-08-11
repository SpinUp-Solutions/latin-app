import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { VerbFormKind } from '@/src/types/api/exercise-word-responses';

const FINITE_MOODS = new Set(['indicative', 'subjunctive', 'imperative']);

const SUPPORTED_STEPS = {
  finite: ['conjugation', 'verb_form', 'tense', 'voice', 'mood', 'person', 'number'],
  infinitive: ['conjugation', 'verb_form', 'tense', 'voice'],
  participle: ['conjugation', 'verb_form', 'tense', 'voice', 'case', 'gender', 'number'],
  gerund: ['conjugation', 'verb_form', 'case'],
  supine: ['conjugation', 'verb_form', 'case'],
} satisfies Record<string, FormIdentificationStep[]>;

type VerbPathStepSupport = {
  label: string;
  formKind: VerbFormKind;
  supportedSteps: readonly FormIdentificationStep[];
};

const supportForKind = (formKind: VerbFormKind): VerbPathStepSupport => {
  switch (formKind) {
    case 'finite':
      return { label: 'Finite verb forms', formKind, supportedSteps: SUPPORTED_STEPS.finite };
    case 'infinitive':
      return { label: 'Infinitive forms', formKind, supportedSteps: SUPPORTED_STEPS.infinitive };
    case 'participle':
      return { label: 'Participle forms', formKind, supportedSteps: SUPPORTED_STEPS.participle };
    case 'gerund':
      return { label: 'Gerund forms', formKind, supportedSteps: SUPPORTED_STEPS.gerund };
    case 'supine':
      return { label: 'Supine forms', formKind, supportedSteps: SUPPORTED_STEPS.supine };
  }
};

export function getSupportedVerbFormStepsForPath(path: string): VerbPathStepSupport | null {
  const parts = path.split('.');

  if (parts.length === 5 && FINITE_MOODS.has(parts[0])) {
    return supportForKind('finite');
  }

  if (parts.length === 4 && parts[0] === 'nonFinite' && parts[1] === 'infinitive') {
    return supportForKind('infinitive');
  }

  if (parts.length === 7 && parts[0] === 'nonFinite' && parts[1] === 'participle') {
    return supportForKind('participle');
  }

  if (parts.length === 2 && parts[0] === 'gerund') {
    return supportForKind('gerund');
  }

  if (parts.length === 2 && parts[0] === 'supine') {
    return supportForKind('supine');
  }

  return null;
}

export function getSupportedVerbFormStepsForParsedPath(
  path: Record<string, string | undefined>
): VerbPathStepSupport | null {
  const verbForm = path.verb_form;
  if (
    verbForm === 'finite' ||
    verbForm === 'infinitive' ||
    verbForm === 'participle' ||
    verbForm === 'gerund' ||
    verbForm === 'supine'
  ) {
    return supportForKind(verbForm);
  }

  // Legacy resolved test attempts encoded non-finite form kinds in `mood`.
  const mood = path.mood;

  if (!mood) {
    return null;
  }

  if (FINITE_MOODS.has(mood)) {
    return supportForKind('finite');
  }

  if (mood === 'infinitive') {
    return supportForKind('infinitive');
  }

  if (mood === 'participle') {
    return supportForKind('participle');
  }

  if (mood === 'gerund') {
    return supportForKind('gerund');
  }

  if (mood === 'supine') {
    return supportForKind('supine');
  }

  return null;
}

export function getVerbFormKindForParsedPath(
  path: Record<string, string | undefined> | null | undefined
): VerbFormKind | '' {
  if (!path) return '';
  return getSupportedVerbFormStepsForParsedPath(path)?.formKind ?? '';
}

/**
 * Returns the selected verb form kinds that cannot answer any configured
 * question. Individual unsupported questions are intentionally allowed:
 * runtime filtering shows only the questions that apply to each form.
 */
export function getVerbFormSelectionsWithNoApplicableSteps(
  selectedCellPaths: readonly string[],
  steps: readonly FormIdentificationStep[]
): VerbPathStepSupport[] {
  if (selectedCellPaths.length === 0 || steps.length === 0) {
    return selectedCellPaths.length === 0
      ? []
      : Array.from(
          new Map(
            selectedCellPaths
              .map(getSupportedVerbFormStepsForPath)
              .filter((support): support is VerbPathStepSupport => support !== null)
              .map(support => [support.formKind, support])
          ).values()
        );
  }

  const selectedSteps = new Set(steps);
  const invalidSelections = new Map<VerbFormKind, VerbPathStepSupport>();

  selectedCellPaths.forEach(path => {
    const support = getSupportedVerbFormStepsForPath(path);
    if (!support) return;

    if (!support.supportedSteps.some(step => selectedSteps.has(step))) {
      invalidSelections.set(support.formKind, support);
    }
  });

  return Array.from(invalidSelections.values());
}

export function getVerbFormSelectionValidationMessages(
  selectedCellPaths: readonly string[],
  steps: readonly FormIdentificationStep[]
): string[] {
  return getVerbFormSelectionsWithNoApplicableSteps(selectedCellPaths, steps).map(
    selection => `${selection.label} have no applicable selected questions.`
  );
}
