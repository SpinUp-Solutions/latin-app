import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ZodError } from 'zod';
import { autocompleteVocabularyWord } from '../../shared/openai/autocomplete';
import { resolveRootWord, ResolveRootWordRequest } from '../../shared/openai/root-resolver';
import { gradeTranslation } from '../../shared/openai/translation-grading';
import { AUTOCOMPLETE_MODEL, DEFAULT_MODEL, TRANSLATION_GRADING_MODEL } from '../../shared/openai/client';
import { AIAutocompleteRequest, TranslationGradingRequest } from '../../shared/openai/types';
import {
  evaluationFunctionDeleteRequestSchema,
  evaluationFunctionRunRequestSchema,
  evaluationFunctionSaveRequestSchema,
} from '../../src/lib/ai-evaluations/contracts';
import { countEvaluationCells, runEvaluationCase } from '../../src/lib/ai-evaluations/execution';
import {
  AIEvaluationServiceError,
  createEvaluationCase,
  deleteEvaluationCase,
  getEvaluationCase,
  listEvaluationCases,
  updateEvaluationCase,
} from '../../src/lib/ai-evaluations/persistence';
import { AIEvaluationThrottleError, consumeEvaluationRunQuota } from '../../src/lib/ai-evaluations/throttle';
import { withOpenAIProviderLease } from '../../src/lib/ai-evaluations/provider-budget';

const openaiApiKey = defineSecret('OPENAI_API_KEY');
const adminApp = getApps()[0] ?? initializeApp();
const functionsDb = getFirestore(adminApp);

async function requireAdmin(auth: { uid: string } | undefined): Promise<string> {
  if (!auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
  const user = await functionsDb.collection('users').doc(auth.uid).get();
  if (user.data()?.role !== 'admin') throw new HttpsError('permission-denied', 'Admin access required');
  return auth.uid;
}

function throwEvaluationHttpsError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof ZodError) throw new HttpsError('invalid-argument', 'Invalid evaluation request');
  if (error instanceof AIEvaluationServiceError) {
    throw new HttpsError(error.status === 404 ? 'not-found' : 'failed-precondition', error.message);
  }
  if (error instanceof AIEvaluationThrottleError) {
    throw new HttpsError('resource-exhausted', error.message, { retryAfterMs: error.retryAfterMs });
  }
  console.error('[ai-evaluations] callable failed', error);
  throw new HttpsError('internal', 'The AI evaluation request could not be completed.');
}

export const autocompleteWord = onCall(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
    secrets: [openaiApiKey],
  },
  async request => {
    console.log('[Firebase Function] autocompleteWord called');

    if (!request.auth) {
      console.error('[Firebase Function] Unauthenticated request');
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as AIAutocompleteRequest;

    if (!data.word || typeof data.word !== 'string') {
      throw new HttpsError('invalid-argument', 'Word is required');
    }

    if (!data.part_of_speech || typeof data.part_of_speech !== 'string') {
      throw new HttpsError('invalid-argument', 'Part of speech is required');
    }

    console.log(`[Firebase Function] Processing: word="${data.word}", part_of_speech="${data.part_of_speech}"`);

    const startTime = Date.now();

    try {
      const { value: result } = await withOpenAIProviderLease(
        functionsDb,
        AUTOCOMPLETE_MODEL,
        () => autocompleteVocabularyWord(data),
        { ownerId: `autocomplete:${request.auth!.uid}:${randomUUID()}` }
      );
      const endTime = Date.now();

      console.log(`[Firebase Function] Completed in ${endTime - startTime}ms`);
      console.log(`[Firebase Function] Success:`, result.success);
      console.log(`[Firebase Function] Model used: ${result.model ?? 'unknown'}`);
      if (result.cost) {
        console.log(`[Firebase Function] Cost: $${result.cost.totalCost.toFixed(4)}`);
      }

      return result;
    } catch (error) {
      const endTime = Date.now();
      console.error(`[Firebase Function] Error after ${endTime - startTime}ms:`, error);

      throw new HttpsError('internal', error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }
);

export const resolveRootWordFn = onCall(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
    region: 'us-central1',
    secrets: [openaiApiKey],
  },
  async request => {
    console.log('[Firebase Function] resolveRootWordFn called');

    if (!request.auth) {
      console.error('[Firebase Function] Unauthenticated request');
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as ResolveRootWordRequest;
    const selectedText = typeof data.selectedText === 'string' ? data.selectedText.trim() : '';

    if (!selectedText) {
      throw new HttpsError('invalid-argument', 'selectedText is required');
    }

    try {
      const startTime = Date.now();
      const { value: result } = await withOpenAIProviderLease(
        functionsDb,
        DEFAULT_MODEL,
        () =>
          resolveRootWord({
            selectedText,
            context: typeof data.context === 'string' ? data.context : undefined,
          }),
        { ownerId: `root-resolver:${request.auth!.uid}:${randomUUID()}` }
      );
      const elapsed = Date.now() - startTime;

      console.log(`[Firebase Function] resolveRootWordFn completed in ${elapsed}ms`);
      console.log(`[Firebase Function] Success:`, result.success);
      console.log(`[Firebase Function] Model used: ${result.model ?? 'unknown'}`);

      return result;
    } catch (error) {
      console.error('[Firebase Function] resolveRootWordFn error:', error);
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }
);

export const gradeTranslationFn = onCall(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
    region: 'us-central1',
    secrets: [openaiApiKey],
  },
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as TranslationGradingRequest;
    console.log(`[gradeTranslationFn] ========================================`);
    console.log(`[gradeTranslationFn] OPENAI_API_KEY present: ${!!process.env.OPENAI_API_KEY}`);
    console.log(`[gradeTranslationFn] Direction: ${data.direction}`);
    console.log(`[gradeTranslationFn] Source: "${data.sourceText?.substring(0, 40)}..."`);

    if (!data.sourceText || typeof data.sourceText !== 'string') {
      throw new HttpsError('invalid-argument', 'sourceText is required');
    }

    if (!data.userTranslation || typeof data.userTranslation !== 'string') {
      throw new HttpsError('invalid-argument', 'userTranslation is required');
    }

    if (!data.direction || (data.direction !== 'latin-to-english' && data.direction !== 'english-to-latin')) {
      throw new HttpsError('invalid-argument', 'direction is required');
    }

    try {
      const startTime = Date.now();
      const { value: result } = await withOpenAIProviderLease(
        functionsDb,
        TRANSLATION_GRADING_MODEL,
        () => gradeTranslation(data),
        { ownerId: `lesson-grading:${request.auth!.uid}:${randomUUID()}` }
      );
      const elapsed = Date.now() - startTime;

      console.log(`[gradeTranslationFn] ✅ Completed in ${elapsed}ms`);
      console.log(`[gradeTranslationFn] Model used: ${result.model}`);
      console.log(`[gradeTranslationFn] Success: ${result.success}, Feedback: ${result.data?.feedbackLevel}`);
      console.log(`[gradeTranslationFn] ========================================`);

      return result;
    } catch (error) {
      console.error(`[gradeTranslationFn] ❌ Error:`, error);
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }
);

const evaluationCrudOptions = {
  timeoutSeconds: 60,
  memory: '256MiB' as const,
  region: 'us-central1',
  concurrency: 20,
  maxInstances: 2,
};

export const listAiEvaluationCasesFn = onCall(evaluationCrudOptions, async request => {
  try {
    await requireAdmin(request.auth ? { uid: request.auth.uid } : undefined);
    return { cases: await listEvaluationCases(functionsDb) };
  } catch (error) {
    return throwEvaluationHttpsError(error);
  }
});

export const saveAiEvaluationCaseFn = onCall(evaluationCrudOptions, async request => {
  try {
    const actorId = await requireAdmin(request.auth ? { uid: request.auth.uid } : undefined);
    const input = evaluationFunctionSaveRequestSchema.parse(request.data);
    const evaluationCase = input.caseId
      ? await updateEvaluationCase(input.caseId, input.input, actorId, functionsDb)
      : await createEvaluationCase(input.input, actorId, functionsDb);
    return { case: evaluationCase };
  } catch (error) {
    return throwEvaluationHttpsError(error);
  }
});

export const deleteAiEvaluationCaseFn = onCall(evaluationCrudOptions, async request => {
  try {
    await requireAdmin(request.auth ? { uid: request.auth.uid } : undefined);
    const input = evaluationFunctionDeleteRequestSchema.parse(request.data);
    await deleteEvaluationCase(input.caseId, functionsDb);
    return { success: true };
  } catch (error) {
    return throwEvaluationHttpsError(error);
  }
});

/**
 * Runs the expensive side-by-side model evaluation entirely in Firebase.
 * The browser calls this function directly, so Netlify never owns the
 * long-lived request and its free-plan timeout cannot terminate the run.
 */
export const runAiEvaluationFn = onCall(
  {
    timeoutSeconds: 540,
    memory: '1GiB',
    region: 'us-central1',
    concurrency: 2,
    maxInstances: 2,
    secrets: [openaiApiKey],
  },
  async request => {
    try {
      const actorId = await requireAdmin(request.auth ? { uid: request.auth.uid } : undefined);
      const input = evaluationFunctionRunRequestSchema.parse(request.data);
      const evaluationCase = await getEvaluationCase(input.caseId, functionsDb);
      const requestedCells = countEvaluationCells(evaluationCase);
      await consumeEvaluationRunQuota(actorId, input.forceRefresh, requestedCells, functionsDb);

      return await runEvaluationCase(evaluationCase, input.forceRefresh, functionsDb);
    } catch (error) {
      return throwEvaluationHttpsError(error);
    }
  }
);
