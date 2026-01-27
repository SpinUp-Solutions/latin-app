import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { autocompleteVocabularyWord } from '../../shared/openai/autocomplete';
import { gradeTranslation } from '../../shared/openai/translation-grading';
import { AIAutocompleteRequest, TranslationGradingRequest } from '../../shared/openai/types';

const openaiApiKey = defineSecret('OPENAI_API_KEY');

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
      const result = await autocompleteVocabularyWord(data);
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
      const result = await gradeTranslation(data);
      const elapsed = Date.now() - startTime;

      console.log(`[gradeTranslationFn] ✅ Completed in ${elapsed}ms`);
      console.log(`[gradeTranslationFn] Model used: ${result.model}`);
      console.log(`[gradeTranslationFn] Success: ${result.success}, Grade: ${result.data?.grade}`);
      console.log(`[gradeTranslationFn] ========================================`);

      return result;
    } catch (error) {
      console.error(`[gradeTranslationFn] ❌ Error:`, error);
      throw new HttpsError('internal', error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }
);
