import type { Firestore } from 'firebase-admin/firestore';
import { runVocabularyAutocomplete, type VocabularyAutocompleteRunResult } from '../../../shared/openai/autocomplete';
import {
  calculateTokenUsageCost,
  EVALUATION_VOCABULARY_AUTOCOMPLETE_PROFILE_IDS,
  VOCABULARY_AUTOCOMPLETE_PROFILES,
  type VocabularyAutocompleteProfileId,
} from '../../../shared/openai/model-registry';
import { emptyCostBreakdown } from '../ai-evaluations/contracts';
import { createVocabularyCacheKey, getCachedVocabularyResult, setCachedVocabularyResult } from './cache';
import {
  VOCABULARY_EVALUATION_SCHEMA_VERSION,
  type VocabularyEvaluationCase,
  type VocabularyEvaluationCell,
  type VocabularyEvaluationEntry,
  type VocabularyEvaluationRunResult,
} from './contracts';

/**
 * A verb at the full output cap takes minutes. One request must give up
 * before the 540 s function timeout so the other results still come back,
 * and a retry after a timeout would not fit, so there is none.
 */
const PROVIDER_TIMEOUT_MS = 450_000;

export function countVocabularyEvaluationCells(evaluationCase: VocabularyEvaluationCase): number {
  return evaluationCase.entries.length * EVALUATION_VOCABULARY_AUTOCOMPLETE_PROFILE_IDS.length;
}

async function runCell(
  entry: VocabularyEvaluationEntry,
  profileId: VocabularyAutocompleteProfileId,
  forceRefresh: boolean,
  db: Firestore
): Promise<VocabularyEvaluationCell> {
  const profile = VOCABULARY_AUTOCOMPLETE_PROFILES[profileId];
  const base = {
    entryId: entry.id,
    word: entry.word,
    partOfSpeech: entry.partOfSpeech,
    profileId,
    requestedModel: profile.model,
    reasoningEffort: profile.reasoningEffort,
    maxOutputTokens: profile.maxOutputTokens,
  };
  const cacheKey = createVocabularyCacheKey(profile, entry.word, entry.partOfSpeech);

  if (!forceRefresh) {
    try {
      const cached = await getCachedVocabularyResult(cacheKey, db);
      if (cached) {
        return {
          ...base,
          actualModel: cached.actualModel,
          output: cached.output,
          generationLatencyMs: cached.latencyMs,
          generatedAt: cached.generatedAt,
          appCacheHit: true,
          usage: cached.usage,
          // Repriced from stored usage so a price change shows up on cached results too.
          cost: calculateTokenUsageCost(cached.usage, profile.pricing),
          costThisRun: emptyCostBreakdown(),
        };
      }
    } catch (error) {
      console.warn('[vocabulary-evaluations] cache read failed; calling the model', error);
    }
  }

  let result: VocabularyAutocompleteRunResult;
  try {
    result = await runVocabularyAutocomplete({ word: entry.word, part_of_speech: entry.partOfSpeech }, profileId, {
      timeout: PROVIDER_TIMEOUT_MS,
      maxRetries: 0,
    });
  } catch (error) {
    console.error('[vocabulary-evaluations] unexpected cell failure', error);
    return {
      ...base,
      error: 'The autocomplete request could not complete.',
      errorCode: 'provider-error',
      generationLatencyMs: 0,
      appCacheHit: false,
    };
  }

  const measured = {
    ...base,
    actualModel: result.model,
    generationLatencyMs: result.latencyMs,
    appCacheHit: false,
    usage: result.usage,
    cost: result.cost,
    costThisRun: result.cost,
  };
  if (!result.success) {
    return { ...measured, error: result.error, errorCode: result.code, incompleteReason: result.incompleteReason };
  }

  const generatedAt = new Date().toISOString();
  if (result.usage) {
    try {
      await setCachedVocabularyResult(
        cacheKey,
        {
          model: result.requestedModel,
          actualModel: result.model ?? result.requestedModel,
          output: result.structured,
          usage: result.usage,
          latencyMs: result.latencyMs,
          generatedAt,
        },
        db
      );
    } catch (error) {
      console.warn('[vocabulary-evaluations] cache write failed', error);
    }
  }
  return { ...measured, output: result.structured, generatedAt };
}

/** Runs every word on every evaluated profile at once. */
export async function runVocabularyEvaluationCase(
  evaluationCase: VocabularyEvaluationCase,
  forceRefresh: boolean,
  db: Firestore
): Promise<VocabularyEvaluationRunResult> {
  const startedAt = new Date();
  const cells = await Promise.all(
    evaluationCase.entries.flatMap(entry =>
      EVALUATION_VOCABULARY_AUTOCOMPLETE_PROFILE_IDS.map(profileId => runCell(entry, profileId, forceRefresh, db))
    )
  );
  const completedAt = new Date();
  return {
    caseId: evaluationCase.id,
    schemaVersion: VOCABULARY_EVALUATION_SCHEMA_VERSION,
    forceRefresh,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    wallTimeMs: completedAt.getTime() - startedAt.getTime(),
    cells,
  };
}
