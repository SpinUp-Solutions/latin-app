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
