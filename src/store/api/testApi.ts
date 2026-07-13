import { createApi } from '@reduxjs/toolkit/query/react';
import type { TestDefinition, TestSummary } from '@/src/types/test';
import { createAuthenticatedBaseQuery } from './baseQuery';

export const testApi = createApi({
  reducerPath: 'testApi',
  baseQuery: createAuthenticatedBaseQuery(),
  tagTypes: ['Test', 'TestList'],
  endpoints: builder => ({
    getTests: builder.query<TestSummary[], void>({
      query: () => '/admin/tests',
      transformResponse: (response: { tests: TestSummary[] }) => response.tests,
      providesTags: result => [
        ...(result || []).map(test => ({ type: 'Test' as const, id: test.id })),
        { type: 'TestList', id: 'LIST' },
      ],
    }),
    getTestById: builder.query<TestDefinition, string>({
      query: id => `/admin/tests/${id}`,
      transformResponse: (response: { test: TestDefinition }) => response.test,
      providesTags: (result, error, id) => [{ type: 'Test', id }],
    }),
    createTest: builder.mutation<{ test: TestDefinition }, TestDefinition>({
      query: test => ({ url: '/admin/tests', method: 'POST', body: test }),
      invalidatesTags: [{ type: 'TestList', id: 'LIST' }],
    }),
    updateTest: builder.mutation<{ test: TestDefinition }, TestDefinition>({
      query: test => ({ url: `/admin/tests/${test.id}`, method: 'PUT', body: test }),
      invalidatesTags: (result, error, test) => [
        { type: 'Test', id: test.id },
        { type: 'TestList', id: 'LIST' },
      ],
    }),
    deleteTest: builder.mutation<{ success: boolean }, string>({
      query: id => ({ url: `/admin/tests/${id}`, method: 'DELETE' }),
      invalidatesTags: (result, error, id) => [
        { type: 'Test', id },
        { type: 'TestList', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetTestsQuery,
  useGetTestByIdQuery,
  useCreateTestMutation,
  useUpdateTestMutation,
  useDeleteTestMutation,
} = testApi;
