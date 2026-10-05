import { createApi } from '@reduxjs/toolkit/query/react';
import { createAuthenticatedBaseQuery } from './baseQuery';
import { APP_API_TAG_TYPES } from './tags';

/** The authenticated RTK Query base for all application APIs that target /api. */
export const appApi = createApi({
  reducerPath: 'appApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: APP_API_TAG_TYPES,
  keepUnusedDataFor: 60 * 5,
  refetchOnMountOrArgChange: 30,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});

type QuerySubscriptionDefaults = {
  refetchOnFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchOnMountOrArgChange?: boolean | number;
};

/**
 * Gives one query hook its own refetch policy. RTK Query sets that policy per
 * API or per subscription, never per endpoint, so endpoints that must not follow
 * the app-wide policy export their hook through this wrapper. Options passed at
 * the call site still win.
 */
export function withSubscriptionDefaults<UseQuery extends (arg: never, options?: never) => unknown>(
  useQuery: UseQuery,
  defaults: QuerySubscriptionDefaults
): UseQuery {
  const useQueryWithDefaults = (arg: never, options?: object) => useQuery(arg, { ...defaults, ...options } as never);
  return useQueryWithDefaults as UseQuery;
}
