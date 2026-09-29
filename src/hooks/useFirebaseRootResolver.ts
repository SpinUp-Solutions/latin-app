import { httpsCallable } from 'firebase/functions';
import { functions } from '@/src/services/firebase';
import type { ResolveRootWordRequest, ResolveRootWordResponse } from '@/shared/openai/root-resolver';

export function useFirebaseRootResolver(options: { onError: (error: string) => void }) {
  const resolveRootWord = async (request: ResolveRootWordRequest) => {
    try {
      const resolveRootWordFn = httpsCallable<ResolveRootWordRequest, ResolveRootWordResponse>(
        functions,
        'resolveRootWordFn',
        { timeout: 120000 }
      );
      const { data: result } = await resolveRootWordFn(request);

      if (!result.success || !result.candidates?.length) {
        options.onError(result.error || 'Could not resolve the root word');
        return null;
      }
      return result;
    } catch (err) {
      options.onError(err instanceof Error ? err.message : 'Unknown error occurred');
      return null;
    }
  };

  return { resolveRootWord };
}
