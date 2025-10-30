import { useState } from 'react';
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

interface UseAIAutocompleteOptions {
  onSuccess?: (
    data: Partial<VocabularyWord>,
    cost?: CostBreakdown,
    fieldStatus?: Record<string, 'filled' | 'missing'>
  ) => void;
  onError?: (error: string, errorInfo?: ErrorInfo) => void;
}

export function useAIAutocomplete(options?: UseAIAutocompleteOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [data, setData] = useState<Partial<VocabularyWord> | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);

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

    const startTime = performance.now();

    try {
      console.log('[useAIAutocomplete] Making request to API:', request);

      const response = await fetch('/api/admin/ai/autocomplete-word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const fetchEndTime = performance.now();
      console.log('[useAIAutocomplete] Response received in', (fetchEndTime - startTime).toFixed(2), 'ms');
      console.log('[useAIAutocomplete] Response details:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });

      const responseText = await response.text();
      console.log('[useAIAutocomplete] Response body (raw):', responseText.substring(0, 500));

      let result: AIAutocompleteResponse;
      try {
        result = JSON.parse(responseText);
        console.log('[useAIAutocomplete] Parsed JSON successfully');
      } catch (parseError) {
        console.error('[useAIAutocomplete] JSON parse error:', parseError);
        console.error('[useAIAutocomplete] Response was:', responseText);
        throw new Error(
          `Failed to parse API response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Response: ${responseText.substring(0, 200)}`
        );
      }

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
      if (result.data) {
        options?.onSuccess?.(result.data, result.cost, result.fieldStatus);
      }

      const totalEndTime = performance.now();
      const totalTime = (totalEndTime - startTime) / 1000;
      console.log(`[useAIAutocomplete] ✅ TOTAL REQUEST TIME: ${totalTime.toFixed(2)}s`);

      return result.data || null;
    } catch (err) {
      const errorEndTime = performance.now();
      const totalTime = (errorEndTime - startTime) / 1000;
      console.log(`[useAIAutocomplete] ❌ TOTAL REQUEST TIME (with error): ${totalTime.toFixed(2)}s`);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      const errInfo: ErrorInfo = {
        message: errorMessage,
        details:
          err instanceof Error
            ? {
                message: err.message,
                type: err.name,
                stack: err.stack,
              }
            : undefined,
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
  };
}
