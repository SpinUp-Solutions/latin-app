import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/lib/firebase';
import { TranslationGradingRequest, TranslationGradingResponse, CostBreakdown } from '@/shared/openai/types';
import type { TranslationGradingOutput } from '@/shared/openai/translation-grading';

interface UseTranslationGradingOptions {
  onSuccess?: (data: TranslationGradingOutput, cost?: CostBreakdown) => void;
  onError?: (error: string) => void;
}

export function useTranslationGrading(options?: UseTranslationGradingOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TranslationGradingOutput | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);

  const reset = () => {
    setError(null);
    setData(null);
    setCost(null);
  };

  const grade = async (request: TranslationGradingRequest) => {
    setIsLoading(true);
    setError(null);
    setData(null);
    setCost(null);

    try {
      const gradeTranslationFn = httpsCallable<
        TranslationGradingRequest,
        TranslationGradingResponse<TranslationGradingOutput>
      >(functions, 'gradeTranslationFn', { timeout: 120000 });

      const response = await gradeTranslationFn(request);
      const result = response.data;

      if (!result.success || !result.data) {
        const errorMessage = result.error || 'Failed to grade translation';
        setError(errorMessage);
        options?.onError?.(errorMessage);
        return null;
      }

      setData(result.data);
      setCost(result.cost || null);
      options?.onSuccess?.(result.data, result.cost);

      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      options?.onError?.(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    grade,
    reset,
    isLoading,
    error,
    data,
    cost,
  };
}
