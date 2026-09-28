import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ZodError } from 'zod';
import { autocompleteVocabularyWord } from '../../shared/openai/autocomplete';
import { resolveRootWord, ResolveRootWordRequest } from '../../shared/openai/root-resolver';
import { gradeTranslation } from '../../shared/openai/translation-grading';
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
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as AIAutocompleteRequest;

    if (!data.word || typeof data.word !== 'string') {
      throw new HttpsError('invalid-argument', 'Word is required');
    }

    if (!data.part_of_speech || typeof data.part_of_speech !== 'string') {
      throw new HttpsError('invalid-argument', 'Part of speech is required');
    }

    const result = await autocompleteVocabularyWord(data);
    if (result.cost) console.log(`[autocompleteWord] ${result.model} cost $${result.cost.totalCost.toFixed(4)}`);
    return result;
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
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const data = request.data as ResolveRootWordRequest;
    const selectedText = typeof data.selectedText === 'string' ? data.selectedText.trim() : '';

    if (!selectedText) {
      throw new HttpsError('invalid-argument', 'selectedText is required');
    }

    return resolveRootWord({
      selectedText,
      context: typeof data.context === 'string' ? data.context : undefined,
    });
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
    if (!data.sourceText || typeof data.sourceText !== 'string') {
      throw new HttpsError('invalid-argument', 'sourceText is required');
    }

    if (!data.userTranslation || typeof data.userTranslation !== 'string') {
      throw new HttpsError('invalid-argument', 'userTranslation is required');
    }

    if (!data.direction || (data.direction !== 'latin-to-english' && data.direction !== 'english-to-latin')) {
      throw new HttpsError('invalid-argument', 'direction is required');
    }

    return gradeTranslation(data);
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
    await requireAdmin(request.auth);
    return { cases: await listEvaluationCases(functionsDb) };
  } catch (error) {
    return throwEvaluationHttpsError(error);
  }
});

export const saveAiEvaluationCaseFn = onCall(evaluationCrudOptions, async request => {
  try {
    const actorId = await requireAdmin(request.auth);
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
    await requireAdmin(request.auth);
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
      const actorId = await requireAdmin(request.auth);
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
