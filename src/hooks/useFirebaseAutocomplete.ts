import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AIAutocompleteResponse, CostBreakdown, ErrorDetails } from '@/shared/openai/types';
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

  const autocomplete = async (request: {
    word: string;
    part_of_speech: PartOfSpeech;
    existingData?: Partial<VocabularyWord>;
    fieldsToComplete?: string[];
    overwriteExisting?: boolean;
  }) => {
    setIsLoading(true);
    const requestData = { word: request.word, part_of_speech: request.part_of_speech };

    try {
      const autocompleteWordFunc = httpsCallable<typeof request, AIAutocompleteResponse>(
        getFunctions(),
        'autocompleteWord',
        { timeout: 540000 }
      );
      const { data: result } = await autocompleteWordFunc(request);

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
      if (result.data) {
        options?.onSuccess?.(result.data, result.cost, result.fieldStatus, result.notes);
      }
      return result.data || null;
    } catch (err: unknown) {
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
      setIsLoading(false);
    }
  };

  return { autocomplete, isLoading, cost };
}
