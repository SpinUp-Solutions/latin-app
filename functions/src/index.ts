import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { onCall, HttpsError, type CallableOptions, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { ZodError, type z } from 'zod';
import { autocompleteVocabularyWord } from '../../shared/openai/autocomplete';
import { resolveRootWord, ResolveRootWordRequest } from '../../shared/openai/root-resolver';
import { gradeTranslation } from '../../shared/openai/translation-grading';
import { AIAutocompleteRequestSchema } from '../../shared/openai/autocomplete-request';
import {
  readVocabularyAIGuidance,
  VocabularyAIGuidanceError,
} from '../../src/lib/vocabulary-ai-guidance/persistence.server';
import { TranslationGradingRequest } from '../../shared/openai/types';
import {
  evaluationFunctionDeleteRequestSchema,
  evaluationFunctionRunRequestSchema,
  evaluationFunctionSaveRequestSchema,
  type StoredEvaluationCase,
} from '../../src/lib/ai-evaluations/contracts';
import { countEvaluationCells, runEvaluationCase } from '../../src/lib/ai-evaluations/execution';
import {
  AIEvaluationServiceError,
  aiEvaluationCases,
  type EvaluationCaseStore,
} from '../../src/lib/ai-evaluations/persistence';
import { AIEvaluationThrottleError, consumeEvaluationRunQuota } from '../../src/lib/ai-evaluations/throttle';
import {
  countVocabularyEvaluationCells,
  runVocabularyEvaluationCase,
} from '../../src/lib/vocabulary-autocomplete-evaluations/execution';
import { vocabularyEvaluationCases } from '../../src/lib/vocabulary-autocomplete-evaluations/persistence';

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
    await requireAdmin(request.auth);
    const parsed = AIAutocompleteRequestSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid vocabulary autocomplete request');
    try {
      const guidance = await readVocabularyAIGuidance(functionsDb);
      const result = await autocompleteVocabularyWord(parsed.data, guidance.rules);
      if (result.cost) console.log(`[autocompleteWord] ${result.model} cost $${result.cost.totalCost.toFixed(4)}`);
      return result;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof VocabularyAIGuidanceError) {
        throw new HttpsError('failed-precondition', 'Saved AI guidance is invalid. Ask an administrator to review it.');
      }
      console.error('[autocompleteWord] callable failed', error);
      throw new HttpsError('internal', 'Vocabulary autocomplete could not be completed.');
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

const evaluationRunOptions = {
  timeoutSeconds: 540,
  memory: '1GiB' as const,
  region: 'us-central1',
  concurrency: 2,
  maxInstances: 2,
  secrets: [openaiApiKey],
};

const evaluationCallable = <T>(options: CallableOptions, handler: (request: CallableRequest) => Promise<T>) =>
  onCall(options, async request => {
    try {
      return await handler(request);
    } catch (error) {
      return throwEvaluationHttpsError(error);
    }
  });

/**
 * The four admin callables of one evaluation suite: list, save and delete its
 * saved cases, and run one. A run happens entirely in Firebase and the browser
 * calls it directly, so the web host never owns the long-lived request and its
 * timeout cannot end the run. Every suite shares the per-admin run quota.
 */
function evaluationSuiteFunctions<Schema extends z.ZodObject>(
  store: EvaluationCaseStore<Schema>,
  countCells: (evaluationCase: StoredEvaluationCase<z.infer<Schema>>) => number,
  run: (evaluationCase: StoredEvaluationCase<z.infer<Schema>>, forceRefresh: boolean, db: Firestore) => Promise<unknown>
) {
  return {
    list: evaluationCallable(evaluationCrudOptions, async request => {
      await requireAdmin(request.auth);
      return { cases: await store.list(functionsDb) };
    }),
    save: evaluationCallable(evaluationCrudOptions, async request => {
      const actorId = await requireAdmin(request.auth);
      const { caseId, input } = evaluationFunctionSaveRequestSchema.parse(request.data);
      return { case: await store.save(caseId, store.inputSchema.parse(input), actorId, functionsDb) };
    }),
    remove: evaluationCallable(evaluationCrudOptions, async request => {
      await requireAdmin(request.auth);
      await store.remove(evaluationFunctionDeleteRequestSchema.parse(request.data).caseId, functionsDb);
      return { success: true };
    }),
    run: evaluationCallable(evaluationRunOptions, async request => {
      const actorId = await requireAdmin(request.auth);
      const { caseId, forceRefresh } = evaluationFunctionRunRequestSchema.parse(request.data);
      const evaluationCase = await store.get(caseId, functionsDb);
      await consumeEvaluationRunQuota(actorId, forceRefresh, countCells(evaluationCase), functionsDb);
      return run(evaluationCase, forceRefresh, functionsDb);
    }),
  };
}

export const {
  list: listAiEvaluationCasesFn,
  save: saveAiEvaluationCaseFn,
  remove: deleteAiEvaluationCaseFn,
  run: runAiEvaluationFn,
} = evaluationSuiteFunctions(aiEvaluationCases, countEvaluationCells, runEvaluationCase);

export const {
  list: listVocabAutocompleteEvalCasesFn,
  save: saveVocabAutocompleteEvalCaseFn,
  remove: deleteVocabAutocompleteEvalCaseFn,
  run: runVocabAutocompleteEvalFn,
} = evaluationSuiteFunctions(vocabularyEvaluationCases, countVocabularyEvaluationCells, runVocabularyEvaluationCase);
