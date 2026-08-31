import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/services/firebase';
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
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [data, setData] = useState<Partial<VocabularyWord> | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const autocomplete = async (request: {
    word: string;
    part_of_speech: PartOfSpeech;
    existingData?: Partial<VocabularyWord>;
    fieldsToComplete?: string[];
    overwriteExisting?: boolean;
  }) => {
    setIsLoading(true);
    setError(null);
    setErrorInfo(null);
    setData(null);
    setNotes(null);

    const startTime = performance.now();

    try {
      console.log('[useFirebaseAutocomplete] Calling Firebase Function:', request);

      const autocompleteWordFunc = httpsCallable<typeof request, AIAutocompleteResponse>(
        functions,
        'autocompleteWord',
        { timeout: 540000 }
      );

      const response = await autocompleteWordFunc(request);
      const result = response.data;

      const fetchEndTime = performance.now();
      console.log('[useFirebaseAutocomplete] Response received in', (fetchEndTime - startTime).toFixed(2), 'ms');
      console.log('[useFirebaseAutocomplete] Result:', result);

      if (!result.success) {
        const errorMessage = result.error || 'Failed to autocomplete word';
        const errInfo: ErrorInfo = {
          message: errorMessage,
          details: result.errorDetails,
          timestamp: new Date().toISOString(),
          requestData: {
            word: request.word,
            part_of_speech: request.part_of_speech,
          },
        };
        setError(errorMessage);
        setErrorInfo(errInfo);
        options?.onError?.(errorMessage, errInfo);
        return null;
      }

      setData(result.data || null);
      setCost(result.cost || null);
      setNotes(result.notes || null);
      if (result.data) {
        options?.onSuccess?.(result.data, result.cost, result.fieldStatus, result.notes);
      }

      const totalEndTime = performance.now();
      const totalTime = (totalEndTime - startTime) / 1000;
      console.log(`[useFirebaseAutocomplete] ✅ TOTAL REQUEST TIME: ${totalTime.toFixed(2)}s`);

      return result.data || null;
    } catch (err: unknown) {
      const errorEndTime = performance.now();
      const totalTime = (errorEndTime - startTime) / 1000;
      console.log(`[useFirebaseAutocomplete] ❌ TOTAL REQUEST TIME (with error): ${totalTime.toFixed(2)}s`);

      const error = err as { message?: string; details?: ErrorDetails; code?: string };
      const errorMessage = error?.message || 'Unknown error occurred';
      const errInfo: ErrorInfo = {
        message: errorMessage,
        details: error?.details || {
          message: errorMessage,
          type: error?.code || 'unknown',
        },
        timestamp: new Date().toISOString(),
        requestData: {
          word: request.word,
          part_of_speech: request.part_of_speech,
        },
      };
      setError(errorMessage);
      setErrorInfo(errInfo);
      options?.onError?.(errorMessage, errInfo);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    autocomplete,
    isLoading,
    error,
    errorInfo,
    data,
    cost,
    notes,
  };
}
