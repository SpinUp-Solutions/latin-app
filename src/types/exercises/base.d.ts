import { ContentItem } from '../content';

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

export interface TimingConfig {
  /** Delay before moving to next question/item within exercise (in ms) */
  progressionDelay?: number;
  /** Delay before moving to next exercise or completing (in ms) */
  nextExerciseDelay?: number;
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

  /** Timing configuration for delays */
  timingConfig?: TimingConfig;
}

/** Base for every exercise type. */
export interface BaseExercise extends ContentItem {
  instructions: string;
  /** Per-exercise feedback behaviour. */
  feedbackConfig: FeedbackConfig;
}
