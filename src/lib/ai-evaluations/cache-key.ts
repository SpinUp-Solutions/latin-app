import { createHash } from 'node:crypto';
import { AI_EVALUATION_SCHEMA_VERSION } from './contracts';
import type { TranslationDirection } from '../../../shared/openai/types';
import type { TranslationGradingMode } from '../../../shared/openai/translation-grading';

export interface EvaluationCacheKeyInput {
  direction: TranslationDirection;
  sourceText: string;
  answerText: string;
  gradingMode: TranslationGradingMode;
  profileId: string;
  model: string;
  reasoningEffort: 'low' | 'high';
  behaviorFingerprint: string;
  schemaVersion?: string;
}

/**
 * SHA-256 keeps cache document ids deterministic without putting student
 * answer text in Firestore paths. The behavior fingerprint automatically
 * invalidates prior results when prompts, schemas, or profiles change.
 */
export function createEvaluationCacheKey(input: EvaluationCacheKeyInput): string {
  const canonicalInput = {
    schemaVersion: input.schemaVersion ?? AI_EVALUATION_SCHEMA_VERSION,
    behaviorFingerprint: input.behaviorFingerprint,
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
