import { useEffect, useState } from 'react';
import { useGetWordsQuery } from '@/src/store/api/vocabularyApi';

/**
 * The vocabulary word list for the given filters. While new filters load, the previous list stays visible; once a
 * request fails, words from other filters are dropped until a request for the current filters succeeds.
 */
export function useCurrentWordsQuery(args: Parameters<typeof useGetWordsQuery>[0]) {
  const { data: lastData, currentData, isFetching, isError, refetch } = useGetWordsQuery(args);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isError) setFailed(true);
    else if (currentData) setFailed(false);
  }, [isError, currentData]);

  const data = currentData ?? (isError || failed ? undefined : lastData);

  return {
    data,
    isLoading: isFetching && !data,
    isFetching,
    isError: isError && !isFetching,
    refetch,
  };
}
