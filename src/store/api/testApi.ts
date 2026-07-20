import type {
  CreateTestWithVersionInput,
  StartTestAttemptInput,
  TestVersionInput,
  UpdateTestWithVersionInput,
  UpdateTestVersionInput,
} from '@/src/lib/tests/schemas';
import type { TestUnit } from '@/src/types/learning-unit';
import type {
  StartTestAttemptResult,
  StudentInProgressTestAttempt,
  StudentTestAttempt,
  TestAttemptOrigin,
  TestUnitDetail,
  TestUnitSummary,
  TestVersion,
  TestVersionSummary,
} from '@/src/types/test';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import { appApi } from './appApi';

const testVersionsForTestTag = (testId: string) => `FOR_TEST:${testId}`;
const attemptSummaryTag = (uid: string, origin: TestAttemptOrigin) =>
  `${origin.kind}:${origin.kind === 'normal-test' ? origin.testId : origin.mockTestId}:${uid}`;

export const testApi = appApi.injectEndpoints({
  endpoints: builder => ({
    getTests: builder.query<TestUnitSummary[], void>({
      query: () => '/admin/tests',
      transformResponse: (response: { tests: TestUnitSummary[] }) => response.tests,
      providesTags: result => [
        ...(result ?? []).map(test => ({ type: 'LearningUnit' as const, id: test.id })),
        { type: 'LearningUnit', id: 'LIST' },
      ],
    }),
    getTestById: builder.query<TestUnitDetail, string>({
      query: id => `/admin/tests/${id}`,
      providesTags: (result, error, id) => [
        { type: 'LearningUnit', id },
        { type: 'TestVersion', id: testVersionsForTestTag(id) },
      ],
    }),
    createTest: builder.mutation<{ test: TestUnit; version: TestVersion }, CreateTestWithVersionInput>({
      query: input => ({ url: '/admin/tests', method: 'POST', body: input }),
      invalidatesTags: result => (result ? [{ type: 'LearningUnit', id: 'LIST' }] : []),
    }),
    updateTest: builder.mutation<
      { test: TestUnit; version: TestVersion },
      { id: string; changes: UpdateTestWithVersionInput }
    >({
      query: ({ id, changes }) => ({ url: `/admin/tests/${id}`, method: 'PATCH', body: changes }),
      invalidatesTags: (result, error, { id, changes }) =>
        result
          ? [
              { type: 'LearningUnit', id },
              { type: 'LearningUnit', id: 'LIST' },
              { type: 'TestVersion', id: changes.versionId },
              { type: 'TestVersion', id: testVersionsForTestTag(id) },
            ]
          : [],
    }),
    getTestVersions: builder.query<TestVersionSummary[], string>({
      query: testId => `/admin/tests/${testId}/versions`,
      transformResponse: (response: { versions: TestVersionSummary[] }) => response.versions,
      providesTags: (result, error, testId) => [
        ...(result ?? []).map(version => ({ type: 'TestVersion' as const, id: version.id })),
        { type: 'TestVersion', id: testVersionsForTestTag(testId) },
      ],
    }),
    createTestVersion: builder.mutation<
      { test: TestUnit; version: TestVersion },
      { testId: string; version: TestVersionInput }
    >({
      query: ({ testId, version }) => ({
        url: `/admin/tests/${testId}/versions`,
        method: 'POST',
        body: version,
      }),
      invalidatesTags: (result, error, { testId }) =>
        result
          ? [
              { type: 'LearningUnit', id: testId },
              { type: 'LearningUnit', id: 'LIST' },
              { type: 'TestVersion', id: testVersionsForTestTag(testId) },
            ]
          : [],
    }),
    getTestVersionById: builder.query<TestVersion, string>({
      query: versionId => `/admin/test-versions/${versionId}`,
      transformResponse: (response: { version: TestVersion }) => response.version,
      providesTags: (result, error, versionId) => [{ type: 'TestVersion', id: versionId }],
    }),
    updateTestVersion: builder.mutation<
      { version: TestVersion },
      { testId: string; versionId: string; changes: UpdateTestVersionInput }
    >({
      query: ({ versionId, changes }) => ({
        url: `/admin/test-versions/${versionId}`,
        method: 'PATCH',
        body: changes,
      }),
      invalidatesTags: (result, error, { testId, versionId }) =>
        result
          ? [
              { type: 'TestVersion', id: versionId },
              { type: 'TestVersion', id: testVersionsForTestTag(testId) },
              { type: 'LearningUnit', id: testId },
              { type: 'LearningUnit', id: 'LIST' },
            ]
          : [],
    }),
    startTestAttempt: builder.mutation<StartTestAttemptResult, StartTestAttemptInput & { uid: string }>({
      query: ({ uid: _uid, ...input }) => ({ url: '/test-attempts/start', method: 'POST', body: input }),
      invalidatesTags: (result, error, { uid, origin }) =>
        result
          ? [
              { type: 'TestAttempt', id: result.attempt.id },
              { type: 'AttemptSummary', id: attemptSummaryTag(uid, origin) },
            ]
          : [],
    }),
    getTestAttempt: builder.query<StudentTestAttempt, { uid: string; attemptId: string }>({
      query: ({ attemptId }) => `/test-attempts/${attemptId}`,
      transformResponse: (response: { attempt: StudentTestAttempt }) => response.attempt,
      providesTags: (result, error, { attemptId }) => [{ type: 'TestAttempt', id: attemptId }],
    }),
    saveTestAttemptAnswer: builder.mutation<
      StudentInProgressTestAttempt,
      { uid: string; attemptId: string; exerciseId: string; answer: ExerciseAnswer | null }
    >({
      query: ({ uid: _uid, attemptId, exerciseId, answer }) => ({
        url: `/test-attempts/${attemptId}/answers`,
        method: 'PATCH',
        body: { exerciseId, answer },
      }),
      transformResponse: (response: { attempt: StudentInProgressTestAttempt }) => response.attempt,
      invalidatesTags: (result, error, { attemptId }) => (result ? [{ type: 'TestAttempt', id: attemptId }] : []),
    }),
  }),
});

export const {
  useGetTestsQuery,
  useGetTestByIdQuery,
  useCreateTestMutation,
  useUpdateTestMutation,
  useGetTestVersionsQuery,
  useCreateTestVersionMutation,
  useGetTestVersionByIdQuery,
  useUpdateTestVersionMutation,
  useStartTestAttemptMutation,
  useGetTestAttemptQuery,
  useSaveTestAttemptAnswerMutation,
} = testApi;
