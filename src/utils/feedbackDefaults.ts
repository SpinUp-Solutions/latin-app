import type { FeedbackConfig, SuccessMessageConfig, ProgressionRules, FeedbackLevel } from '@/src/types/exercises/base';

export const FEEDBACK_DEFAULTS = {
  showExplanation: true,
  autoAdvance: true,
  resetOnCorrect: true,
  showProgress: true,
  allowManualAdvance: true,
} as const;

export const DEFAULT_ITEM_PROGRESSION_DELAY = 2000;
export const DEFAULT_PAGE_AUTO_ADVANCE = { enabled: true, delay: 2000 };

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

export function getEffectiveFeedbackConfig(config: FeedbackConfig): {
  escalationLevels: FeedbackLevel[];
  successMessage: SuccessMessageConfig;
  progressionRules: ProgressionRules;
} {
  return {
    escalationLevels: (config.escalationLevels ?? []).map(normalizeEscalationLevel),
    successMessage: getSuccessMessageWithDefaults(config.successMessage),
    progressionRules: getProgressionRulesWithDefaults(config.progressionRules),
  };
}
