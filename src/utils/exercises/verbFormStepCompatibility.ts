import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { VerbFormKind } from '@/src/types/api/exercise-word-responses';

const FINITE_MOODS = new Set(['indicative', 'subjunctive', 'imperative']);

const SUPPORTED_STEPS = {
  finite: ['conjugation', 'verb_form', 'tense', 'voice', 'mood', 'person', 'number'],
  infinitive: ['conjugation', 'verb_form', 'tense', 'voice'],
  participle: ['conjugation', 'verb_form', 'tense', 'voice', 'case', 'gender', 'number'],
  gerund: ['conjugation', 'verb_form', 'case'],
  supine: ['conjugation', 'verb_form', 'case'],
} satisfies Record<VerbFormKind, FormIdentificationStep[]>;

const LABELS: Record<VerbFormKind, string> = {
  finite: 'Finite verb forms',
  infinitive: 'Infinitive forms',
  participle: 'Participle forms',
  gerund: 'Gerund forms',
  supine: 'Supine forms',
};

type VerbPathStepSupport = {
  label: string;
  formKind: VerbFormKind;
  supportedSteps: readonly FormIdentificationStep[];
};

const supportForKind = (formKind: VerbFormKind): VerbPathStepSupport => ({
  label: LABELS[formKind],
  formKind,
  supportedSteps: SUPPORTED_STEPS[formKind],
});

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
  if (!mood) return null;
  if (FINITE_MOODS.has(mood)) return supportForKind('finite');
  if (mood === 'infinitive' || mood === 'participle' || mood === 'gerund' || mood === 'supine') {
    return supportForKind(mood);
  }
  return null;
}

export function getVerbFormKindForParsedPath(
  path: Record<string, string | undefined> | null | undefined
): VerbFormKind | '' {
  if (!path) return '';
  return getSupportedVerbFormStepsForParsedPath(path)?.formKind ?? '';
}
