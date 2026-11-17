import { useEffect, useRef, useState } from 'react';
import { AIAutocompleteRequest, AIAutocompleteResponse, CostBreakdown, ErrorDetails } from '@/shared/openai/types';
import { PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';

export interface ErrorInfo {
  message: string;
  details?: ErrorDetails;
  timestamp: string;
  requestData?: {
    word: string;
    part_of_speech: PartOfSpeech;
  };
}

export type AutocompleteOutcome =
  | { ok: true; result: AIAutocompleteResponse }
  | { ok: false; error: string; info: ErrorInfo };

/**
 * One call to the `autocompleteWord` callable, with failures as a value. It
 * holds no React state, so a caller that outlives one editor can own it.
 */
export async function callAutocompleteWord(request: AIAutocompleteRequest): Promise<AutocompleteOutcome> {
  const requestData = { word: request.word, part_of_speech: request.part_of_speech };
  const failure = (message: string, details?: ErrorDetails): AutocompleteOutcome => ({
    ok: false,
    error: message,
    info: { message, details, timestamp: new Date().toISOString(), requestData },
  });
  try {
    // Loaded on first use: editors that never call the AI do not pull in the Functions SDK.
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const autocompleteWordFunc = httpsCallable<typeof request, AIAutocompleteResponse>(
      getFunctions(),
      'autocompleteWord',
      { timeout: 540000 }
    );
    const { data: result } = await autocompleteWordFunc(request);
    if (!result.success) return failure(result.error || 'Failed to autocomplete word', result.errorDetails);
    return { ok: true, result };
  } catch (err: unknown) {
    const error = err as { message?: string; details?: ErrorDetails; code?: string };
    const message = error?.message || 'Unknown error occurred';
    return failure(message, error?.details || { message, type: error?.code || 'unknown' });
  }
}

interface UseFirebaseAutocompleteOptions {
  onError?: (error: string, errorInfo?: ErrorInfo) => void;
}

export function useFirebaseAutocomplete(options?: UseFirebaseAutocompleteOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [cost, setCost] = useState<CostBreakdown | null>(null);

  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  const invalidate = () => {
    generation.current += 1;
    setIsLoading(false);
  };

  const requestAutocomplete = async (request: AIAutocompleteRequest): Promise<AIAutocompleteResponse | null> => {
    const requestGeneration = ++generation.current;
    setIsLoading(true);
    try {
      const outcome = await callAutocompleteWord(request);
      if (generation.current !== requestGeneration) return null;
      if (!outcome.ok) {
        options?.onError?.(outcome.error, outcome.info);
        return null;
      }
      setCost(outcome.result.cost || null);
      return outcome.result;
    } finally {
      if (generation.current === requestGeneration) setIsLoading(false);
    }
  };

  return { requestAutocomplete, invalidate, isLoading, cost };
}
