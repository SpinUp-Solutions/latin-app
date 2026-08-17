import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';
import type { TableType } from '@/src/utils/schema-helpers';
import { getSupportedVerbFormStepsForPath, getSupportedVerbFormStepsForParsedPath } from './verbFormStepCompatibility';

export interface FormPathStepSupport {
  label: string;
  supportedSteps: readonly FormIdentificationStep[];
}

export interface FormPathCompatibility {
  path: string;
  support: FormPathStepSupport;
  applicableSteps: FormIdentificationStep[];
}

export interface FormIdentificationCompatibilitySummary {
  selectedCount: number;
  answerableCount: number;
  skipped: FormPathCompatibility[];
  unknownPaths: string[];
}

const NOUN_STEPS: readonly FormIdentificationStep[] = ['declension', 'case', 'number', 'gender'];
const ADJECTIVE_STEPS: readonly FormIdentificationStep[] = ['declension', 'degree', 'case', 'number', 'gender'];
const PERSONAL_PRONOUN_STEPS: readonly FormIdentificationStep[] = ['pronoun_type', 'person', 'case', 'number'];
const GENDERED_PRONOUN_STEPS: readonly FormIdentificationStep[] = [
  'pronoun_type',
  'person',
  'gender',
  'case',
  'number',
];

const supportForTableType = (tableType: TableType): FormPathStepSupport => {
  switch (tableType) {
    case 'declension':
      return { label: 'Noun forms', supportedSteps: NOUN_STEPS };
    case 'adjective-declension':
      return { label: 'Adjective forms', supportedSteps: ADJECTIVE_STEPS };
    case 'pronoun-declension':
      return { label: 'Personal pronoun forms', supportedSteps: PERSONAL_PRONOUN_STEPS };
    case 'pronoun-adjective-declension':
      return { label: 'Gendered pronoun forms', supportedSteps: GENDERED_PRONOUN_STEPS };
    case 'conjugation':
      // A conjugation path is parsed below so that finite/non-finite forms
      // retain their different sets of answerable questions.
      return { label: 'Verb forms', supportedSteps: [] };
  }
};

/**
 * Returns the grammatical fields a selected table path can answer. This is
 * deliberately path based: a saved selection can contain a mixture of finite
 * verbs, infinitives, participles, gerunds, and supines.
 */
export function getFormPathStepSupport(path: string, tableType: TableType): FormPathStepSupport | null {
  if (tableType === 'conjugation') return getSupportedVerbFormStepsForPath(path);

  const parts = path.split('.');
  const isValid =
    (tableType === 'declension' && parts.length === 2) ||
    (tableType === 'adjective-declension' && (parts.length === 2 || parts.length === 4)) ||
    (tableType === 'pronoun-declension' && parts.length === 2) ||
    (tableType === 'pronoun-adjective-declension' && (parts.length === 2 || parts.length === 3));

  return isValid ? supportForTableType(tableType) : null;
}

/**
 * Same compatibility lookup for paths already parsed into a generated word.
 * The editor uses string paths while student generation uses parsed paths.
 */
export function getParsedFormPathStepSupport(
  partOfSpeech: string,
  path: Record<string, string | undefined>
): FormPathStepSupport | null {
  if (partOfSpeech === 'verb') return getSupportedVerbFormStepsForParsedPath(path);
  if (partOfSpeech === 'noun') return supportForTableType('declension');
  if (partOfSpeech === 'adjective') return supportForTableType('adjective-declension');
  if (partOfSpeech === 'pronoun') {
    return path.gender
      ? supportForTableType('pronoun-adjective-declension')
      : supportForTableType('pronoun-declension');
  }
  return null;
}

export function getApplicableStepsForFormPath(
  path: string,
  tableType: TableType,
  selectedSteps: readonly FormIdentificationStep[]
): FormPathCompatibility | null {
  const support = getFormPathStepSupport(path, tableType);
  if (!support) return null;
  const selected = new Set(selectedSteps);
  return {
    path,
    support,
    applicableSteps: support.supportedSteps.filter(step => selected.has(step)),
  };
}

export function getFormIdentificationCompatibilitySummary(
  tableType: TableType,
  selectedPaths: readonly string[],
  selectedSteps: readonly FormIdentificationStep[]
): FormIdentificationCompatibilitySummary {
  const skipped: FormPathCompatibility[] = [];
  const unknownPaths: string[] = [];
  let answerableCount = 0;

  selectedPaths.forEach(path => {
    const compatibility = getApplicableStepsForFormPath(path, tableType, selectedSteps);
    if (!compatibility) {
      unknownPaths.push(path);
      return;
    }
    if (compatibility.applicableSteps.length === 0) skipped.push(compatibility);
    else answerableCount += 1;
  });

  return {
    selectedCount: selectedPaths.length,
    answerableCount,
    skipped,
    unknownPaths,
  };
}

export function getSelectedFormPathCompatibility(
  partOfSpeech: string,
  path: Record<string, string | undefined>,
  selectedSteps: readonly FormIdentificationStep[]
): FormPathCompatibility | null {
  const support = getParsedFormPathStepSupport(partOfSpeech, path);
  if (!support) return null;
  const selected = new Set(selectedSteps);
  return {
    path: '',
    support,
    applicableSteps: support.supportedSteps.filter(step => selected.has(step)),
  };
}

export function getCompatibilityStepLabels(steps: readonly FormIdentificationStep[]): string {
  const labels = steps.map(step => {
    const humanized = step.replace(/_/g, ' ');
    return humanized.charAt(0).toUpperCase() + humanized.slice(1);
  });

  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
}
