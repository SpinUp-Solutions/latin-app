import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';

const FINITE_MOODS = new Set(['indicative', 'subjunctive', 'imperative']);

const SUPPORTED_STEPS = {
  finite: ['conjugation', 'tense', 'voice', 'mood', 'person', 'number'],
  infinitive: ['conjugation', 'tense', 'voice', 'mood'],
  participle: ['conjugation', 'tense', 'voice', 'mood', 'case', 'gender', 'number'],
  gerund: ['conjugation', 'mood', 'case'],
  supine: ['conjugation', 'mood', 'case'],
} satisfies Record<string, FormIdentificationStep[]>;

type VerbPathStepSupport = {
  label: string;
  supportedSteps: readonly FormIdentificationStep[];
};

export function getSupportedVerbFormStepsForPath(path: string): VerbPathStepSupport | null {
  const parts = path.split('.');

  if (parts.length === 5 && FINITE_MOODS.has(parts[0])) {
    return { label: 'Finite verb forms', supportedSteps: SUPPORTED_STEPS.finite };
  }

  if (parts.length === 4 && parts[0] === 'nonFinite' && parts[1] === 'infinitive') {
    return { label: 'Infinitive forms', supportedSteps: SUPPORTED_STEPS.infinitive };
  }

  if (parts.length === 7 && parts[0] === 'nonFinite' && parts[1] === 'participle') {
    return { label: 'Participle forms', supportedSteps: SUPPORTED_STEPS.participle };
  }

  if (parts.length === 2 && parts[0] === 'gerund') {
    return { label: 'Gerund forms', supportedSteps: SUPPORTED_STEPS.gerund };
  }

  if (parts.length === 2 && parts[0] === 'supine') {
    return { label: 'Supine forms', supportedSteps: SUPPORTED_STEPS.supine };
  }

  return null;
}

export function getSupportedVerbFormStepsForParsedPath(
  path: Record<string, string | undefined>
): VerbPathStepSupport | null {
  const mood = path.mood;

  if (!mood) {
    return null;
  }

  if (FINITE_MOODS.has(mood)) {
    return { label: 'Finite verb forms', supportedSteps: SUPPORTED_STEPS.finite };
  }

  if (mood === 'infinitive') {
    return { label: 'Infinitive forms', supportedSteps: SUPPORTED_STEPS.infinitive };
  }

  if (mood === 'participle') {
    return { label: 'Participle forms', supportedSteps: SUPPORTED_STEPS.participle };
  }

  if (mood === 'gerund') {
    return { label: 'Gerund forms', supportedSteps: SUPPORTED_STEPS.gerund };
  }

  if (mood === 'supine') {
    return { label: 'Supine forms', supportedSteps: SUPPORTED_STEPS.supine };
  }

  return null;
}

export function getUnsupportedVerbFormStepWarnings(
  selectedCellPaths: string[],
  steps: readonly FormIdentificationStep[]
): string[] {
  if (selectedCellPaths.length === 0 || steps.length === 0) {
    return [];
  }

  const unsupportedByLabel = new Map<string, Set<FormIdentificationStep>>();

  selectedCellPaths.forEach(path => {
    const support = getSupportedVerbFormStepsForPath(path);
    if (!support) return;

    const supported = new Set(support.supportedSteps);
    const unsupported = steps.filter(step => !supported.has(step));

    if (unsupported.length === 0) {
      return;
    }

    const existing = unsupportedByLabel.get(support.label) ?? new Set<FormIdentificationStep>();
    unsupported.forEach(step => existing.add(step));
    unsupportedByLabel.set(support.label, existing);
  });

  return Array.from(unsupportedByLabel.entries()).map(([label, unsupported]) => {
    const stepList = Array.from(unsupported)
      .map(step => step.replace(/_/g, ' '))
      .join(', ');

    return `${label} cannot answer: ${stepList}.`;
  });
}
