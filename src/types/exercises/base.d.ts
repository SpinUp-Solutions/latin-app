import { ContentItem } from '../content';
import type { TableType } from '@/src/utils/schema-helpers';
import type { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import type { FormIdentificationStep } from './schemas/form-identification';

export interface FeedbackLevel {
  /** Custom message shown at this level (optional). */
  message?: string;
  /** Reveal the correct answer (optional). */
  showAnswer?: boolean;
  /** When true the component should use the per-item `hint` field. */
  showHint?: boolean;
}

export interface SuccessMessageConfig {
  /** Default success message */
  default?: string;
  /** Message when completing the final item/question */
  completion?: string;
  /** Message when advancing to next item */
  advance?: string;
  /** Show explanation after correct answer (when available) */
  showExplanation: boolean;
}

export interface ProgressionRules {
  autoAdvanceOnCorrect?: boolean;
  pauseForExplanation?: boolean;
  showProgress?: boolean;
}

export interface FeedbackConfig {
  /**
   * Ordered list of escalation levels. The component decides WHEN to move
   * from one level to the next; this config decides WHAT to show.
   */
  escalationLevels: FeedbackLevel[];

  /** Success message configuration */
  successMessage?: SuccessMessageConfig;

  /** Generic behaviour flags (work for every exercise). */
  progressionRules?: ProgressionRules;

  /**
   * Number of wrong answers on the current question before the entire
   * exercise resets. `undefined` or `0` = disabled.
   */
  maxLevelFailures?: number;
}

// New robust state machine types
export type FeedbackPhase = 'initial' | 'attempting' | 'succeeded' | 'failed';

export interface FeedbackState {
  readonly phase: FeedbackPhase;
  readonly currentAttempt: number;
  readonly activeLevel: FeedbackLevel | null;
  readonly displayMessage: string;
  readonly shouldShowHint: boolean;
  readonly shouldShowAnswer: boolean;
  readonly shouldShowExplanation: boolean;
}

export type FeedbackAction =
  | { type: 'ANSWER_INCORRECT'; escalationLevels: FeedbackLevel[] }
  | { type: 'ANSWER_CORRECT'; successMessage: string; showExplanation: boolean; isLastItem?: boolean }
  | { type: 'CLEAR_FEEDBACK' }
  | { type: 'RESET' }
  | { type: 'EXERCISE_RESET' };

export interface FeedbackMachineConfig {
  escalationLevels: FeedbackLevel[];
  successMessage: SuccessMessageConfig;
  progressionRules: ProgressionRules;
}

export interface BaseExercise extends ContentItem {
  instructions: string;
  /** Required only when the exercise is persisted inside a test version. */
  maxPoints?: number;
  itemProgressionDelay?: number;
  feedbackConfig: FeedbackConfig;
}

export interface GeneratorFilters {
  partOfSpeech?: string;
  verbConjugation?: string;
  isDeponent?: string;
  nounDeclension?: string;
  adjectiveDeclension?: string;
  pronounType?: string;
  pronounPerson?: string;
  search?: string;
}

export interface FormSelection {
  tableType: TableType;
  selectedCellPaths: string[];
}

export interface GeneratorConfigBase {
  collection: string;
  wordSource: 'filters' | 'pool';
  poolId?: string | null;
  poolWordLimit?: number | null;
  count: number | 'all';
  filters?: GeneratorFilters;
}

export interface PosGeneratorConfig {
  enabled: boolean;
  filters: Omit<GeneratorFilters, 'partOfSpeech'>;
  formSelection?: FormSelection;
}

export interface FormIdentificationPosConfig extends PosGeneratorConfig {
  steps: FormIdentificationStep[];
}

export type PosConfigs = Partial<Record<PartOfSpeech, PosGeneratorConfig>>;
export type FormIdentificationPosConfigs = Partial<Record<PartOfSpeech, FormIdentificationPosConfig>>;
