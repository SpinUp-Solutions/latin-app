import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/services/firebase';
import { TranslationGradingRequest, TranslationGradingResponse } from '@/shared/openai/types';
import type { TranslationGradingOutput } from '@/shared/openai/translation-grading';

export function useTranslationGrading() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TranslationGradingOutput | null>(null);

  const reset = () => {
    setError(null);
    setData(null);
  };

  const grade = async (request: TranslationGradingRequest) => {
    setIsLoading(true);
    setError(null);
    setData(null);

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
        return null;
      }

      setData(result.data);
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { grade, reset, isLoading, error, data };
}
