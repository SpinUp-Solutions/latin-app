import type { FeedbackConfig, SuccessMessageConfig, ProgressionRules, FeedbackLevel } from '@/src/types/exercises/base';

const FEEDBACK_DEFAULTS = {
  showExplanation: true,
  autoAdvanceOnCorrect: true,
  pauseForExplanation: true,
  showProgress: true,
} as const;

export const DEFAULT_ITEM_PROGRESSION_DELAY = 2000;

/** How long a missed word's correction stays on screen before the word is requeued, unless the exercise sets its own. */
export const MISSED_ANSWER_PROGRESSION_DELAY = 5000;

export function getSuccessMessageWithDefaults(successMessage?: SuccessMessageConfig): SuccessMessageConfig {
  return {
    default: successMessage?.default || '',
    completion: successMessage?.completion || '',
    advance: successMessage?.advance || '',
    showExplanation: successMessage?.showExplanation ?? FEEDBACK_DEFAULTS.showExplanation,
  };
}

export function getProgressionRulesWithDefaults(rules?: ProgressionRules): Required<ProgressionRules> {
  return {
    autoAdvanceOnCorrect: rules?.autoAdvanceOnCorrect ?? FEEDBACK_DEFAULTS.autoAdvanceOnCorrect,
    pauseForExplanation: rules?.pauseForExplanation ?? FEEDBACK_DEFAULTS.pauseForExplanation,
    showProgress: rules?.showProgress ?? FEEDBACK_DEFAULTS.showProgress,
  };
}

export function normalizeEscalationLevel(level: FeedbackLevel): FeedbackLevel {
  return {
    ...level,
    showHint: !!level.showHint,
    showAnswer: !!level.showAnswer,
  };
}

export function createDefaultFeedbackConfig(): FeedbackConfig {
  return {
    escalationLevels: [],
    successMessage: getSuccessMessageWithDefaults(),
    progressionRules: getProgressionRulesWithDefaults(),
  };
}

export function getEffectiveFeedbackConfig(config: FeedbackConfig) {
  return {
    escalationLevels: (config.escalationLevels ?? []).map(normalizeEscalationLevel),
    successMessage: getSuccessMessageWithDefaults(config.successMessage),
    progressionRules: getProgressionRulesWithDefaults(config.progressionRules),
    maxLevelFailures: config.maxLevelFailures,
  };
}
