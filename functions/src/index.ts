import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ZodError } from 'zod';
import { autocompleteVocabularyWord } from '../../shared/openai/autocomplete';
import { resolveRootWord } from '../../shared/openai/root-resolver';
import { gradeTranslation } from '../../shared/openai/translation-grading';
import {
  aiAutocompleteRequestSchema,
  rootWordRequestSchema,
  translationGradingRequestSchema,
} from '../../shared/openai/request-contracts';
import { createOpenAISafetyIdentifier } from '../../shared/openai/safety';
import { USERS_COLLECTION } from '../../shared/constants/firestore';
import {
  evaluationFunctionDeleteRequestSchema,
  evaluationFunctionRunRequestSchema,
  evaluationFunctionSaveRequestSchema,
  missingEvaluationCriteria,
} from '../../src/lib/ai-evaluations/contracts';
import { countEvaluationCells, runEvaluationCase } from '../../src/lib/ai-evaluations/execution';
import {
  AIEvaluationServiceError,
  createEvaluationCase,
  deleteEvaluationCase,
  getEvaluationCase,
  listEvaluationCases,
  listEvaluationRunSummaries,
  persistEvaluationRun,
  updateEvaluationCase,
} from '../../src/lib/ai-evaluations/persistence';
import { AIEvaluationThrottleError, consumeEvaluationRunQuota } from '../../src/lib/ai-evaluations/throttle';
import {
  AIRequestThrottleError,
  consumeAIGlobalRequestQuota,
  consumeAIRequestQuota,
} from '../../src/lib/openai/request-throttle';
import { aiCallableAccessError, shouldEnforceAIAppCheck, type AICallableName } from './ai-callable-policy';

const openaiApiKey = defineSecret('OPENAI_API_KEY');
const adminApp = getApps()[0] ?? initializeApp();
const functionsDb = getFirestore(adminApp);

const appCheckOptions = { enforceAppCheck: shouldEnforceAIAppCheck() };

function throwCallableAccessError(error: 'unauthenticated' | 'permission-denied'): never {
  throw new HttpsError(error, error === 'unauthenticated' ? 'User must be authenticated' : 'Admin access required');
}

function requireAuthenticated(callableName: AICallableName, auth: { uid: string } | undefined): string {
  const error = aiCallableAccessError(callableName, auth?.uid);
  if (error) throwCallableAccessError(error);
  return auth!.uid;
}

async function requireAdmin(callableName: AICallableName, auth: { uid: string } | undefined): Promise<string> {
  if (!auth) throwCallableAccessError('unauthenticated');
  const user = await functionsDb.collection(USERS_COLLECTION).doc(auth.uid).get();
  const error = aiCallableAccessError(callableName, auth.uid, user.data()?.role);
  if (error) throwCallableAccessError(error);
  return auth.uid;
}

function throwAIHttpsError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof ZodError) throw new HttpsError('invalid-argument', 'Invalid AI request');
  if (error instanceof AIRequestThrottleError) {
    throw new HttpsError('resource-exhausted', error.message, { retryAfterMs: error.retryAfterMs });
  }
  console.error('[ai] callable failed', error);
  throw new HttpsError('internal', 'The AI request could not be completed.');
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
  if (error instanceof AIRequestThrottleError) {
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
    ...appCheckOptions,
  },
  async request => {
    console.log('[Firebase Function] autocompleteWord called');

    try {
      const actorId = await requireAdmin('autocompleteWord', request.auth ? { uid: request.auth.uid } : undefined);
      const data = aiAutocompleteRequestSchema.parse(request.data);
      await consumeAIRequestQuota(actorId, 'autocomplete', functionsDb);
      const startTime = Date.now();
      const result = await autocompleteVocabularyWord(data, {
        safetyIdentifier: createOpenAISafetyIdentifier(actorId),
      });
      const endTime = Date.now();

      console.log(`[Firebase Function] Completed in ${endTime - startTime}ms`);
      console.log(`[Firebase Function] Success:`, result.success);
      console.log(`[Firebase Function] Model used: ${result.model ?? 'unknown'}`);
      if (result.cost) {
        console.log(`[Firebase Function] Cost: $${result.cost.totalCost.toFixed(4)}`);
      }

      return result;
    } catch (error) {
      return throwAIHttpsError(error);
    }
  }
);

export const resolveRootWordFn = onCall(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
    region: 'us-central1',
    secrets: [openaiApiKey],
    ...appCheckOptions,
  },
  async request => {
    console.log('[Firebase Function] resolveRootWordFn called');

    try {
      const actorId = await requireAdmin('resolveRootWordFn', request.auth ? { uid: request.auth.uid } : undefined);
      const data = rootWordRequestSchema.parse(request.data);
      await consumeAIRequestQuota(actorId, 'root-resolver', functionsDb);
      const startTime = Date.now();
      const result = await resolveRootWord(
        {
          selectedText: data.selectedText,
          context: data.context,
        },
        {
          safetyIdentifier: createOpenAISafetyIdentifier(actorId),
        }
      );
      const elapsed = Date.now() - startTime;

      console.log(`[Firebase Function] resolveRootWordFn completed in ${elapsed}ms`);
      console.log(`[Firebase Function] Success:`, result.success);
      console.log(`[Firebase Function] Model used: ${result.model ?? 'unknown'}`);

      return result;
    } catch (error) {
      return throwAIHttpsError(error);
    }
  }
);

export const gradeTranslationFn = onCall(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
    region: 'us-central1',
    secrets: [openaiApiKey],
    ...appCheckOptions,
  },
  async request => {
    try {
      const actorId = requireAuthenticated('gradeTranslationFn', request.auth ? { uid: request.auth.uid } : undefined);
      const data = translationGradingRequestSchema.parse(request.data);
      await consumeAIRequestQuota(actorId, 'lesson-grading', functionsDb);
      const startTime = Date.now();
      const result = await gradeTranslation(data, {
        safetyIdentifier: createOpenAISafetyIdentifier(actorId),
      });
      const elapsed = Date.now() - startTime;

      console.log(`[gradeTranslationFn] ✅ Completed in ${elapsed}ms`);
      console.log(`[gradeTranslationFn] Model used: ${result.model}`);
      console.log(`[gradeTranslationFn] Success: ${result.success}, Feedback: ${result.data?.feedbackLevel}`);
      console.log(`[gradeTranslationFn] ========================================`);

      return result;
    } catch (error) {
      return throwAIHttpsError(error);
    }
  }
);

const evaluationCrudOptions = {
  timeoutSeconds: 60,
  memory: '256MiB' as const,
  region: 'us-central1',
  concurrency: 20,
  maxInstances: 2,
  ...appCheckOptions,
};

export const listAiEvaluationCasesFn = onCall(evaluationCrudOptions, async request => {
  try {
    await requireAdmin('listAiEvaluationCasesFn', request.auth ? { uid: request.auth.uid } : undefined);
    return { cases: await listEvaluationCases(functionsDb) };
  } catch (error) {
    return throwEvaluationHttpsError(error);
  }
});

export const listAiEvaluationRunsFn = onCall(evaluationCrudOptions, async request => {
  try {
    await requireAdmin('listAiEvaluationRunsFn', request.auth ? { uid: request.auth.uid } : undefined);
    return { runs: await listEvaluationRunSummaries(functionsDb) };
  } catch (error) {
    return throwEvaluationHttpsError(error);
  }
});

export const saveAiEvaluationCaseFn = onCall(evaluationCrudOptions, async request => {
  try {
    const actorId = await requireAdmin('saveAiEvaluationCaseFn', request.auth ? { uid: request.auth.uid } : undefined);
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
    await requireAdmin('deleteAiEvaluationCaseFn', request.auth ? { uid: request.auth.uid } : undefined);
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
    ...appCheckOptions,
  },
  async request => {
    try {
      const actorId = await requireAdmin('runAiEvaluationFn', request.auth ? { uid: request.auth.uid } : undefined);
      const input = evaluationFunctionRunRequestSchema.parse(request.data);
      const evaluationCase = await getEvaluationCase(input.caseId, functionsDb);
      const missingCriteria = missingEvaluationCriteria(evaluationCase);
      if (missingCriteria.length > 0) {
        throw new AIEvaluationServiceError(
          'AI_EVALUATION_CRITERIA_REQUIRED',
          `Add expected outcomes before running: ${missingCriteria.join('; ')}`,
          409
        );
      }
      const requestedCells = countEvaluationCells(evaluationCase);
      await consumeEvaluationRunQuota(actorId, input.forceRefresh, requestedCells, functionsDb);
      await consumeAIGlobalRequestQuota('evaluation', requestedCells, functionsDb);

      const result = await runEvaluationCase(evaluationCase, input.forceRefresh, functionsDb, {
        safetyIdentifier: createOpenAISafetyIdentifier(actorId),
      });
      try {
        return await persistEvaluationRun(evaluationCase, result, actorId, functionsDb);
      } catch (error) {
        console.error('[ai-evaluations] failed to persist completed run', error);
        return { ...result, historySaved: false };
      }
    } catch (error) {
      return throwEvaluationHttpsError(error);
    }
  }
);
