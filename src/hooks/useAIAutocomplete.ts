import { useState } from 'react';
import { AIAutocompleteResponse, CostBreakdown, ErrorDetails } from '@/src/lib/openai/types';
import { VocabularyWord } from '@/src/types/vocabulary/schemas';
import { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';

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
    fieldStatus?: Record<string, 'filled' | 'missing'>,
    notes?: string
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

    try {
      const response = await fetch('/api/admin/ai/autocomplete-word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const result: AIAutocompleteResponse = await response.json();

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
        options?.onSuccess?.(result.data, result.cost, result.fieldStatus, result.notes);
      }

      return result.data || null;
    } catch (err) {
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
