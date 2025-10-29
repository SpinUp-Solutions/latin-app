import { useState } from 'react';
import { AIAutocompleteRequest, AIAutocompleteResponse, CostBreakdown } from '@/src/lib/openai/types';
import { VocabularyWord } from '@/src/types/vocabulary/schemas';
import { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';

interface UseAIAutocompleteOptions {
  onSuccess?: (data: Partial<VocabularyWord>, cost?: CostBreakdown, fieldStatus?: Record<string, 'filled' | 'missing'>, notes?: string) => void;
  onError?: (error: string) => void;
}

export function useAIAutocomplete(options?: UseAIAutocompleteOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError(errorMessage);
        options?.onError?.(errorMessage);
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
      setError(errorMessage);
      options?.onError?.(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    autocomplete,
    isLoading,
    error,
    data,
    cost,
  };
}
