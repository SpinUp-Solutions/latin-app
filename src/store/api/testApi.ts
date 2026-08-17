import type {
  CreateTestWithVersionInput,
  StartTestAttemptInput,
  TestVersionDraftInput,
  UpdateTestVersionDraftInput,
  UpdateTestWithVersionInput,
  UpdateTestUnitInput,
} from '@/src/lib/tests/schemas';
import type { TestUnit } from '@/src/types/learning-unit';
import type {
  StartTestAttemptResult,
  StudentInProgressTestAttempt,
  SubmitTestAttemptResult,
  TestUnitDetail,
  TestUnitSummary,
  TestVersion,
  TestVersionDraft,
} from '@/src/types/test';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import { appApi } from './appApi';
import { getAttemptSummaryTagId, STUDENT_DASHBOARD_TAG } from './tags';

const testVersionsForTestTag = (testId: string) => `FOR_TEST:${testId}`;

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
    createTest: builder.mutation<
      { test: TestUnit; version: TestVersion; recovered: boolean },
      CreateTestWithVersionInput
    >({
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
              STUDENT_DASHBOARD_TAG,
            ]
          : [],
    }),
    updateTestSettings: builder.mutation<{ test: TestUnit }, { id: string; changes: UpdateTestUnitInput }>({
      query: ({ id, changes }) => ({ url: `/admin/tests/${id}/settings`, method: 'PATCH', body: changes }),
      invalidatesTags: (result, error, { id }) =>
        result ? [{ type: 'LearningUnit', id }, { type: 'LearningUnit', id: 'LIST' }, STUDENT_DASHBOARD_TAG] : [],
    }),
    createTestVersion: builder.mutation<
      { test: TestUnit; version: TestVersionDraft },
      { testId: string; version: TestVersionDraftInput }
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
              STUDENT_DASHBOARD_TAG,
            ]
          : [],
    }),
    getTestVersionById: builder.query<TestVersion, string>({
      query: versionId => `/admin/test-versions/${versionId}`,
      transformResponse: (response: { version: TestVersion }) => response.version,
      providesTags: (result, error, versionId) => [{ type: 'TestVersion', id: versionId }],
    }),
    duplicateTestVersion: builder.mutation<
      { test: TestUnit; version: TestVersionDraft },
      { testId: string; versionId: string; requestId: string; name?: string }
    >({
      query: ({ testId, versionId, ...body }) => ({
        url: `/admin/tests/${testId}/versions/${versionId}/duplicate`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error, { testId }) =>
        result
          ? [
              { type: 'LearningUnit', id: testId },
              { type: 'LearningUnit', id: 'LIST' },
              { type: 'TestVersion', id: result.version.id },
              { type: 'TestVersion', id: testVersionsForTestTag(testId) },
              STUDENT_DASHBOARD_TAG,
            ]
          : [],
    }),
    updateTestVersionDraft: builder.mutation<
      { test: TestUnit; version: TestVersionDraft },
      { testId: string; versionId: string; changes: UpdateTestVersionDraftInput }
    >({
      query: ({ testId, versionId, changes }) => ({
        url: `/admin/tests/${testId}/versions/${versionId}`,
        method: 'PATCH',
        body: changes,
      }),
      invalidatesTags: (result, error, { testId, versionId }) =>
        result
          ? [
              { type: 'LearningUnit', id: testId },
              { type: 'LearningUnit', id: 'LIST' },
              { type: 'TestVersion', id: versionId },
              { type: 'TestVersion', id: testVersionsForTestTag(testId) },
            ]
          : [],
    }),
    activateTestVersion: builder.mutation<
      { test: TestUnit; version: TestVersion },
      { testId: string; versionId: string }
    >({
      query: ({ testId, versionId }) => ({
        url: `/admin/tests/${testId}/versions/${versionId}/activate`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, { testId, versionId }) =>
        result
          ? [
              { type: 'LearningUnit', id: testId },
              { type: 'LearningUnit', id: 'LIST' },
              { type: 'TestVersion', id: versionId },
              { type: 'TestVersion', id: testVersionsForTestTag(testId) },
              STUDENT_DASHBOARD_TAG,
            ]
          : [],
    }),
    deactivateTestVersion: builder.mutation<
      { test: TestUnit; version: TestVersionDraft },
      { testId: string; versionId: string }
    >({
      query: ({ testId, versionId }) => ({
        url: `/admin/tests/${testId}/versions/${versionId}/deactivate`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, { testId, versionId }) =>
        result
          ? [
              { type: 'LearningUnit', id: testId },
              { type: 'LearningUnit', id: 'LIST' },
              { type: 'TestVersion', id: versionId },
              { type: 'TestVersion', id: testVersionsForTestTag(testId) },
              STUDENT_DASHBOARD_TAG,
            ]
          : [],
    }),
    startTestAttempt: builder.mutation<StartTestAttemptResult, StartTestAttemptInput & { uid: string }>({
      query: ({ uid: _uid, ...input }) => ({ url: '/test-attempts/start', method: 'POST', body: input }),
      invalidatesTags: (result, error, { uid, origin }) =>
        result
          ? [
              { type: 'TestAttempt', id: result.attempt.id },
              { type: 'AttemptSummary', id: getAttemptSummaryTagId(uid, origin) },
              ...(origin.kind === 'mock-test' ? [{ type: 'MockTest' as const, id: 'STUDENT' }] : []),
            ]
          : [],
    }),
    saveTestAttemptAnswers: builder.mutation<
      StudentInProgressTestAttempt,
      {
        uid: string;
        attemptId: string;
        answers: Record<string, ExerciseAnswer | null>;
      }
    >({
      query: ({ uid: _uid, attemptId, answers }) => ({
        url: `/test-attempts/${attemptId}/answers`,
        method: 'PATCH',
        body: { answers },
      }),
      transformResponse: (response: { attempt: StudentInProgressTestAttempt }) => response.attempt,
      invalidatesTags: (result, error, { attemptId }) => (result ? [{ type: 'TestAttempt', id: attemptId }] : []),
    }),
    gradeTestTranslation: builder.mutation<
      StudentInProgressTestAttempt,
      {
        uid: string;
        attemptId: string;
        exerciseId: string;
        itemIndex: number;
        userTranslation: string;
      }
    >({
      query: ({ uid: _uid, attemptId, ...body }) => ({
        url: `/test-attempts/${attemptId}/translation-grade`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { attempt: StudentInProgressTestAttempt }) => response.attempt,
      invalidatesTags: (result, error, { attemptId }) => (result ? [{ type: 'TestAttempt', id: attemptId }] : []),
    }),
    submitTestAttempt: builder.mutation<SubmitTestAttemptResult, { uid: string; attemptId: string }>({
      query: ({ attemptId }) => ({ url: `/test-attempts/${attemptId}/submit`, method: 'POST' }),
      invalidatesTags: (result, error, { uid, attemptId }) =>
        result
          ? [
              { type: 'TestAttempt', id: attemptId },
              { type: 'AttemptSummary', id: getAttemptSummaryTagId(uid, result.attempt.origin) },
              ...(result.attempt.origin.kind === 'mock-test'
                ? [
                    { type: 'MockTest' as const, id: 'STUDENT' },
                    // Refresh the frozen-session detail as well as the live
                    // student-card collection after a mock submission.
                    { type: 'MockTest' as const, id: result.attempt.origin.mockTestId },
                  ]
                : []),
              // A lost first response makes the idempotent retry report
              // completionGranted: false, so gate on the outcome instead.
              { type: 'StudentLearningPath' as const, id: uid },
              STUDENT_DASHBOARD_TAG,
            ]
          : [],
    }),
  }),
});

export const {
  useGetTestsQuery,
  useGetTestByIdQuery,
  useCreateTestMutation,
  useUpdateTestMutation,
  useUpdateTestSettingsMutation,
  useCreateTestVersionMutation,
  useGetTestVersionByIdQuery,
  useDuplicateTestVersionMutation,
  useUpdateTestVersionDraftMutation,
  useActivateTestVersionMutation,
  useDeactivateTestVersionMutation,
  useStartTestAttemptMutation,
  useSaveTestAttemptAnswersMutation,
  useGradeTestTranslationMutation,
  useSubmitTestAttemptMutation,
} = testApi;
