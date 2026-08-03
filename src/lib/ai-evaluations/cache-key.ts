import { createHash } from 'node:crypto';
import { AI_EVALUATION_SCHEMA_VERSION, type EvaluationDirection } from './contracts';
import type { TranslationGradingMode } from '../../../shared/openai/translation-grading';

export interface EvaluationCacheKeyInput {
  direction: EvaluationDirection;
  sourceText: string;
  answerText: string;
  gradingMode: TranslationGradingMode;
  profileId: string;
  model: string;
  reasoningEffort: 'low' | 'high';
  promptVersion: string;
  profileVersion?: string;
  schemaVersion?: string;
}

/**
 * SHA-256 keeps cache document ids deterministic without putting student
 * answer text in Firestore paths. The version fields intentionally invalidate
 * all prior results when prompts, schemas, or profiles change.
 */
export function createEvaluationCacheKey(input: EvaluationCacheKeyInput): string {
  const canonicalInput = {
    schemaVersion: input.schemaVersion ?? AI_EVALUATION_SCHEMA_VERSION,
    promptVersion: input.promptVersion,
    profileVersion: input.profileVersion ?? input.promptVersion,
    gradingMode: input.gradingMode,
    profileId: input.profileId,
    direction: input.direction,
    sourceText: input.sourceText,
    answerText: input.answerText,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
  };
  return createHash('sha256').update(JSON.stringify(canonicalInput), 'utf8').digest('hex');
}
