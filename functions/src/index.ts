import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { autocompleteVocabularyWord } from '../../shared/openai/autocomplete';
import { gradeTranslation } from '../../shared/openai/translation-grading';
import { AIAutocompleteRequest, TranslationGradingRequest } from '../../shared/openai/types';

const openaiApiKey = defineSecret('OPENAI_API_KEY');

export const autocompleteWord = onCall({
  timeoutSeconds: 540,
  memory: '1GiB',
  region: 'us-central1',
  secrets: [openaiApiKey],
}, async (request) => {
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
    const result = await autocompleteVocabularyWord(data);
    const endTime = Date.now();

    console.log(`[Firebase Function] Completed in ${endTime - startTime}ms`);
    console.log(`[Firebase Function] Success:`, result.success);

    return result;
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Firebase Function] Error after ${endTime - startTime}ms:`, error);

    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
});

export const gradeTranslationFn = onCall({
  timeoutSeconds: 120,
  memory: '512MiB',
  region: 'us-central1',
  secrets: [openaiApiKey],
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const data = request.data as TranslationGradingRequest;

  if (!data.latinText || typeof data.latinText !== 'string') {
    throw new HttpsError('invalid-argument', 'latinText is required');
  }

  if (!data.userTranslation || typeof data.userTranslation !== 'string') {
    throw new HttpsError('invalid-argument', 'userTranslation is required');
  }

  try {
    const result = await gradeTranslation(data);
    return result;
  } catch (error) {
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
});
