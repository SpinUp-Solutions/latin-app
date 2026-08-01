import type {
  AssignVersionToMockInput,
  CreateStandaloneMockInput,
  DuplicateStandaloneMockVersionIntoTestInput,
  MoveStandaloneMockToTestInput,
  ReactivateStandaloneMockInput,
  ReorderMockTestsInput,
  UpdateTestVersionInput,
  UpdateMockTestInput,
} from '@/src/lib/tests/schemas';
import type { TestUnit } from '@/src/types/learning-unit';
import type { StudentMockTestDetail, MockTest, MockTestSummary, TestVersion } from '@/src/types/test';
import { getAttemptSummaryTagId } from './tags';
import { appApi } from './appApi';
import { STUDENT_DASHBOARD_TAG } from './tags';

const forTest = (testId: string) => `FOR_TEST:${testId}`;
const baseMockTags = (mockId?: string) => [
  ...(mockId ? [{ type: 'MockTest' as const, id: mockId }] : []),
  { type: 'MockTest' as const, id: 'LIST' },
  { type: 'MockTest' as const, id: 'STUDENT' },
  STUDENT_DASHBOARD_TAG,
];
const testProjectionTags = (testId: string) => [
  { type: 'LearningUnit' as const, id: testId },
  { type: 'LearningUnit' as const, id: 'LIST' },
  { type: 'TestVersion' as const, id: forTest(testId) },
];
const parentProjectionTags = (mock: MockTest) =>
  mock.parent.kind === 'test' ? testProjectionTags(mock.parent.testId) : [];

export const mockTestApi = appApi.injectEndpoints({
  endpoints: builder => ({
    getMocks: builder.query<MockTestSummary[], void>({
      query: () => '/admin/mock-tests',
      transformResponse: (response: { mocks: MockTestSummary[] }) => response.mocks,
      providesTags: result => [
        ...(result ?? []).map(mock => ({ type: 'MockTest' as const, id: mock.id })),
        { type: 'MockTest', id: 'LIST' },
      ],
    }),
    getStudentMockDetail: builder.query<StudentMockTestDetail, { uid: string; mockId: string }>({
      query: ({ mockId }) => `/mock-tests/${mockId}`,
      transformResponse: (response: { detail: StudentMockTestDetail }) => response.detail,
      providesTags: (result, _error, { uid, mockId }) => [
        { type: 'MockTest', id: mockId },
        { type: 'AttemptSummary', id: getAttemptSummaryTagId(uid, { kind: 'mock-test', mockTestId: mockId }) },
        ...(result?.attempt ? [{ type: 'TestAttempt' as const, id: result.attempt.id }] : []),
      ],
    }),
    getMock: builder.query<MockTest, string>({
      query: id => `/admin/mock-tests/${id}`,
      transformResponse: (response: { mock: MockTest }) => response.mock,
      providesTags: (result, error, id) => [{ type: 'MockTest', id }],
    }),
    createStandaloneMock: builder.mutation<{ mock: MockTest; version: TestVersion }, CreateStandaloneMockInput>({
      query: body => ({ url: '/admin/mock-tests', method: 'POST', body }),
      invalidatesTags: result =>
        result ? [...baseMockTags(result.mock.id), { type: 'TestVersion', id: result.version.id }] : [],
    }),
    assignMock: builder.mutation<{ mock: MockTest }, AssignVersionToMockInput>({
      query: body => ({ url: '/admin/mock-tests/assign', method: 'POST', body }),
      invalidatesTags: result =>
        result
          ? [
              ...baseMockTags(result.mock.id),
              ...parentProjectionTags(result.mock),
              { type: 'TestVersion', id: result.mock.versionId },
              { type: 'AttemptSummary' },
            ]
          : [],
    }),
    updateMock: builder.mutation<{ mock: MockTest }, { id: string; body: UpdateMockTestInput }>({
      query: ({ id, body }) => ({ url: `/admin/mock-tests/${id}`, method: 'PATCH', body }),
      invalidatesTags: result =>
        result
          ? [
              ...baseMockTags(result.mock.id),
              ...parentProjectionTags(result.mock),
              { type: 'TestVersion', id: result.mock.versionId },
              { type: 'AttemptSummary' },
            ]
          : [],
    }),
    updateMockVersion: builder.mutation<
      { version: TestVersion },
      { mockId: string; parentTestId?: string; versionId: string; changes: UpdateTestVersionInput }
    >({
      query: ({ mockId, changes }) => ({ url: `/admin/mock-tests/${mockId}/version`, method: 'PATCH', body: changes }),
      invalidatesTags: (result, error, { mockId, parentTestId, versionId }) =>
        result
          ? [
              ...baseMockTags(mockId),
              ...(parentTestId ? testProjectionTags(parentTestId) : []),
              { type: 'TestVersion', id: versionId },
              { type: 'AttemptSummary' },
            ]
          : [],
    }),
    archiveMock: builder.mutation<{ mock: MockTest }, string>({
      query: id => ({ url: `/admin/mock-tests/${id}/archive`, method: 'POST' }),
      invalidatesTags: result =>
        result
          ? [
              ...baseMockTags(result.mock.id),
              ...parentProjectionTags(result.mock),
              { type: 'TestVersion', id: result.mock.versionId },
              { type: 'AttemptSummary' },
            ]
          : [],
    }),
    reactivateStandaloneMock: builder.mutation<{ mock: MockTest }, { id: string; body: ReactivateStandaloneMockInput }>(
      {
        query: ({ id, body }) => ({ url: `/admin/mock-tests/${id}/reactivate`, method: 'POST', body }),
        invalidatesTags: result =>
          result
            ? [
                ...baseMockTags(result.mock.id),
                { type: 'TestVersion', id: result.mock.versionId },
                { type: 'AttemptSummary' },
              ]
            : [],
      }
    ),
    moveMockToTest: builder.mutation<
      { mock: MockTest; test: TestUnit },
      { id: string; body: MoveStandaloneMockToTestInput }
    >({
      query: ({ id, body }) => ({ url: `/admin/mock-tests/${id}/move-to-test`, method: 'POST', body }),
      invalidatesTags: result =>
        result
          ? [
              ...baseMockTags(result.mock.id),
              ...testProjectionTags(result.test.id),
              { type: 'TestVersion', id: result.mock.versionId },
              { type: 'AttemptSummary' },
            ]
          : [],
    }),
    duplicateMockIntoTest: builder.mutation<
      { mock: MockTest; test: TestUnit; version: TestVersion },
      { id: string; body: DuplicateStandaloneMockVersionIntoTestInput }
    >({
      query: ({ id, body }) => ({ url: `/admin/mock-tests/${id}/duplicate-into-test`, method: 'POST', body }),
      invalidatesTags: result =>
        result
          ? [
              ...baseMockTags(result.mock.id),
              ...testProjectionTags(result.test.id),
              { type: 'TestVersion', id: result.version.id },
            ]
          : [],
    }),
    reorderMocks: builder.mutation<{ mocks: MockTest[] }, ReorderMockTestsInput>({
      query: body => ({ url: '/admin/mock-tests', method: 'PATCH', body }),
      invalidatesTags: result => (result ? baseMockTags() : []),
    }),
  }),
});

export const {
  useGetMocksQuery,
  useGetStudentMockDetailQuery,
  useCreateStandaloneMockMutation,
  useAssignMockMutation,
  useGetMockQuery,
  useUpdateMockMutation,
  useUpdateMockVersionMutation,
  useArchiveMockMutation,
  useReactivateStandaloneMockMutation,
  useMoveMockToTestMutation,
  useDuplicateMockIntoTestMutation,
  useReorderMocksMutation,
} = mockTestApi;
