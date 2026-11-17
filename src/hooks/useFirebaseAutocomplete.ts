import { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AIAutocompleteRequest, AIAutocompleteResponse, CostBreakdown, ErrorDetails } from '@/shared/openai/types';
import { VocabularyWord } from '@/shared/types/vocabulary/schemas';
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

interface UseFirebaseAutocompleteOptions {
  onSuccess?: (
    data: Partial<VocabularyWord>,
    cost?: CostBreakdown,
    fieldStatus?: Record<string, 'filled' | 'missing'>,
    notes?: string
  ) => void;
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
    const requestData = { word: request.word, part_of_speech: request.part_of_speech };

    try {
      const autocompleteWordFunc = httpsCallable<typeof request, AIAutocompleteResponse>(
        getFunctions(),
        'autocompleteWord',
        { timeout: 540000 }
      );
      const { data: result } = await autocompleteWordFunc(request);

      if (generation.current !== requestGeneration) return null;

      if (!result.success) {
        const errorMessage = result.error || 'Failed to autocomplete word';
        options?.onError?.(errorMessage, {
          message: errorMessage,
          details: result.errorDetails,
          timestamp: new Date().toISOString(),
          requestData,
        });
        return null;
      }

      setCost(result.cost || null);
      return result;
    } catch (err: unknown) {
      if (generation.current !== requestGeneration) return null;
      const error = err as { message?: string; details?: ErrorDetails; code?: string };
      const errorMessage = error?.message || 'Unknown error occurred';
      options?.onError?.(errorMessage, {
        message: errorMessage,
        details: error?.details || { message: errorMessage, type: error?.code || 'unknown' },
        timestamp: new Date().toISOString(),
        requestData,
      });
      return null;
    } finally {
      if (generation.current === requestGeneration) setIsLoading(false);
    }
  };

  // Preserve the draft-editor API; review controls need the full response envelope.
  const autocomplete = async (request: AIAutocompleteRequest) => {
    const result = await requestAutocomplete(request);
    if (result?.data) options?.onSuccess?.(result.data, result.cost, result.fieldStatus);
    return result?.data || null;
  };

  return { autocomplete, requestAutocomplete, invalidate, isLoading, cost };
}
