/**
 * Shared types for exercise validation utilities
 */

export interface ValidationResult {
  isCorrect: boolean;
  correctAnswer?: string;
  hint?: string;
  explanation?: string;
}

export interface MatchingValidationResult extends ValidationResult {
  leftItem?: { id: string; value: string };
  rightItem?: { id: string; value: string };
  expectedMatch?: string;
}
