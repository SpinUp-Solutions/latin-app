import { ContentItem } from '../content';
import type { TableType } from '@/src/utils/schema-helpers';

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
  /** Auto-advance after a correct answer (default: true). */
  autoAdvance?: boolean;
  /** Reset escalation counter after a correct answer (default: true). */
  resetOnCorrect?: boolean;
  /** Show progress indicator (default: true) */
  showProgress?: boolean;
  /** Allow manual advancement (default: true) */
  allowManualAdvance?: boolean;
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
  | { type: 'RESET' };

export interface FeedbackMachineConfig {
  escalationLevels: FeedbackLevel[];
  successMessage: SuccessMessageConfig;
  progressionRules: ProgressionRules;
}

export interface BaseExercise extends ContentItem {
  instructions: string;
  itemProgressionDelay?: number;
  feedbackConfig: FeedbackConfig;
}

export interface GeneratorFilters {
  partOfSpeech?: string;
  verbConjugation?: string;
  isDeponent?: string;
  nounDeclension?: string;
  adjectiveDeclension?: string;
  search?: string;
}

export interface FormSelection {
  tableType: TableType;
  selectedCellPaths: string[];
}

export interface GeneratorConfigBase {
  collection: string;
  filters: GeneratorFilters;
  formSelection?: FormSelection;
  count: number;
}
