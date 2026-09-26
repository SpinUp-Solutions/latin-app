import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/services/firebase';
import type { ResolveRootWordRequest, ResolveRootWordResponse } from '@/shared/openai/root-resolver';
import type { RootWordCandidate } from '@/shared/types/vocabulary/requests';

interface UseFirebaseRootResolverOptions {
  onSuccess?: (candidates: RootWordCandidate[], result: ResolveRootWordResponse) => void;
  onError?: (error: string) => void;
}

export function useFirebaseRootResolver(options?: UseFirebaseRootResolverOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RootWordCandidate[]>([]);

  const resolveRootWord = async (request: ResolveRootWordRequest) => {
    setIsLoading(true);
    setError(null);
    setCandidates([]);

    try {
      const resolveRootWordFn = httpsCallable<ResolveRootWordRequest, ResolveRootWordResponse>(
        functions,
        'resolveRootWordFn',
        { timeout: 120000 }
      );

      const response = await resolveRootWordFn(request);
      const result = response.data;

      if (!result.success || !result.candidates?.length) {
        const errorMessage = result.error || 'Could not resolve the root word';
        setError(errorMessage);
        options?.onError?.(errorMessage);
        return null;
      }

      setCandidates(result.candidates);
      options?.onSuccess?.(result.candidates, result);
      return result;
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
    resolveRootWord,
    isLoading,
    error,
    candidates,
  };
}
