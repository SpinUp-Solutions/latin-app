import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { VerbFormKind } from '@/src/types/api/exercise-word-responses';

const FINITE_MOODS = new Set(['indicative', 'subjunctive', 'imperative']);
const NON_FINITE_FORM_KINDS = new Set<VerbFormKind>(['infinitive', 'participle', 'gerund', 'supine']);

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

function normalizeStepsForFormKinds(
  steps: readonly FormIdentificationStep[],
  formKinds: readonly VerbFormKind[]
): FormIdentificationStep[] {
  const hasFinite = formKinds.includes('finite');
  const hasNonFinite = formKinds.some(kind => NON_FINITE_FORM_KINDS.has(kind));
  const shouldReplaceMood = hasNonFinite && !hasFinite;
  const shouldAddVerbForm = hasNonFinite && hasFinite;
  const normalized: FormIdentificationStep[] = [];

  for (const step of steps) {
    if (step === 'mood' && shouldReplaceMood) {
      if (!normalized.includes('verb_form')) normalized.push('verb_form');
      continue;
    }

    if (step === 'mood' && shouldAddVerbForm && !normalized.includes('verb_form')) {
      normalized.push('verb_form');
    }

    if (!normalized.includes(step)) normalized.push(step);
  }

  return normalized;
}

export function normalizeVerbFormStepsForSelectedPaths(
  selectedCellPaths: readonly string[],
  steps: readonly FormIdentificationStep[]
): FormIdentificationStep[] {
  const formKinds = selectedCellPaths
    .map(getSupportedVerbFormStepsForPath)
    .filter((support): support is VerbPathStepSupport => support !== null)
    .map(support => support.formKind);
  return normalizeStepsForFormKinds(steps, formKinds);
}

export function normalizeVerbFormStepsForParsedPaths(
  paths: Array<Record<string, string | undefined>>,
  steps: readonly FormIdentificationStep[]
): FormIdentificationStep[] {
  const formKinds = paths
    .map(getSupportedVerbFormStepsForParsedPath)
    .filter((support): support is VerbPathStepSupport => support !== null)
    .map(support => support.formKind);
  return normalizeStepsForFormKinds(steps, formKinds);
}

export function getVerbFormKindForParsedPath(
  path: Record<string, string | undefined> | null | undefined
): VerbFormKind | '' {
  if (!path) return '';
  return getSupportedVerbFormStepsForParsedPath(path)?.formKind ?? '';
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
