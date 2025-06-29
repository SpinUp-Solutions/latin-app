import type { FeedbackConfig, SuccessMessageConfig, ProgressionRules, TimingConfig } from '@/src/types/exercises/base';

export const FEEDBACK_DEFAULTS = {
  progressionDelay: 1500,
  nextExerciseDelay: 2500,
  showExplanation: true,
  autoAdvance: true,
  resetOnCorrect: true,
  showProgress: true,
  allowManualAdvance: true,
} as const;

export function getSuccessMessageWithDefaults(successMessage?: SuccessMessageConfig): SuccessMessageConfig {
  return {
    default: successMessage?.default || '',
    completion: successMessage?.completion || '',
    advance: successMessage?.advance || '',
    showExplanation: successMessage?.showExplanation ?? FEEDBACK_DEFAULTS.showExplanation,
  };
}

export function getProgressionRulesWithDefaults(rules?: ProgressionRules): ProgressionRules {
  return {
    autoAdvance: rules?.autoAdvance ?? FEEDBACK_DEFAULTS.autoAdvance,
    resetOnCorrect: rules?.resetOnCorrect ?? FEEDBACK_DEFAULTS.resetOnCorrect,
    showProgress: rules?.showProgress ?? FEEDBACK_DEFAULTS.showProgress,
    allowManualAdvance: rules?.allowManualAdvance ?? FEEDBACK_DEFAULTS.allowManualAdvance,
  };
}

export function getTimingConfigWithDefaults(timing?: TimingConfig): TimingConfig {
  return {
    progressionDelay: timing?.progressionDelay ?? FEEDBACK_DEFAULTS.progressionDelay,
    nextExerciseDelay: timing?.nextExerciseDelay ?? FEEDBACK_DEFAULTS.nextExerciseDelay,
  };
}

export function createDefaultFeedbackConfig(): FeedbackConfig {
  return {
    escalationLevels: [],
    successMessage: getSuccessMessageWithDefaults(),
    progressionRules: getProgressionRulesWithDefaults(),
    timingConfig: getTimingConfigWithDefaults(),
  };
}
