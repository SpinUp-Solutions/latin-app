import { configureStore } from '@reduxjs/toolkit';
import { waitFor } from '@testing-library/react';
import { appApi } from '@/src/store/api/appApi';
import { lessonApi } from '@/src/store/api/lessonApi';
import { practiceCategoryApi } from '@/src/store/api/practiceCategoryApi';
import { testApi } from '@/src/store/api/testApi';
import { mockTestApi } from '@/src/store/api/mockTestApi';

const mockBaseQuery = jest.fn();
let failPublication = false;
let failProgress = false;
let failMockMutation = false;

jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));

const createStore = () =>
  configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(appApi.middleware),
  });

const requestUrl = (request: unknown) =>
  typeof request === 'string' ? request : (request as { url?: string } | undefined)?.url;

describe('student dashboard cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    failPublication = false;
    failProgress = false;
    failMockMutation = false;
    mockBaseQuery.mockImplementation(async (request: unknown) => {
      switch (requestUrl(request)) {
        case '/student-dashboard':
          return {
            data: {
              dashboard: {
                learningPath: [],
                practiceLessons: [],
                mockTests: [{ id: 'mock-1' }],
              },
            },
          };
        case '/admin/lessons/update-publish-status':
          if (failPublication) {
            return {
              error: {
                status: 409,
                data: { error: 'Publication rejected' },
              },
            };
          }
          return { data: { success: true } };
        case '/admin/practice-categories/category-1/lessons':
          return { data: { memberships: [] } };
        case '/admin/practice-categories/category-1/tags':
          return {
            data: {
              tag: {
                id: 'cicero',
                name: 'Cicero',
                normalizedName: 'cicero',
                status: 'active',
                tagOrder: 0,
                createdAt: 'now',
                createdBy: 'admin',
                updatedAt: 'now',
                updatedBy: 'admin',
              },
            },
          };
        case '/admin/practice-categories/category-1/lessons/vocab-1/tags':
          return {
            data: {
              membership: {
                id: 'membership-1',
                categoryId: 'category-1',
                lessonId: 'vocab-1',
                lessonOrder: 0,
                tagIds: ['cicero'],
                createdAt: 'now',
                createdBy: 'admin',
                updatedAt: 'now',
                updatedBy: 'admin',
              },
            },
          };
        case '/lessons/lesson-1':
          return {
            data: {
              lesson: {
                id: 'lesson-1',
                title: 'Lesson',
                type: 'normal',
                pages: [],
              },
            },
          };
        case '/progress/student-1/lesson-1':
          if (failProgress) {
            return {
              error: {
                status: 409,
                data: { error: 'Progress rejected' },
              },
            };
          }
          return { data: { success: true, lessonCompleted: false } };
        case '/admin/test-versions/version-a':
          return {
            data: {
              version: {
                id: 'version-a',
                name: 'Version A',
                pages: [],
                totalPages: 0,
                totalItems: 0,
                totalExercises: 0,
                totalPoints: 0,
              },
            },
          };
        case '/admin/tests/test-1':
          return {
            data: {
              test: { id: 'test-1', kind: 'test', rotationVersions: [], passingPercentage: null },
              versions: [],
              mocks: [],
            },
          };
        case '/test-attempts/start':
          return {
            data: { attempt: { id: 'attempt-1', origin: { kind: 'mock-test', mockTestId: 'mock-1' } }, resumed: false },
          };
        case '/test-attempts/attempt-1/submit':
          return {
            data: {
              attempt: { id: 'attempt-1', origin: { kind: 'mock-test', mockTestId: 'mock-1' }, status: 'submitted' },
              completionGranted: false,
            },
          };
        case '/admin/mock-tests/assign':
          if (failMockMutation) return { error: { status: 409, data: { error: 'Mock mutation rejected' } } };
          return {
            data: {
              mock: {
                id: 'mock-parent',
                parent: { kind: 'test', testId: 'test-1' },
                versionId: 'version-a',
                title: 'Mock',
                description: '',
                status: 'active',
                isLive: true,
                mockOrder: 0,
                passingPercentage: null,
              },
            },
          };
        case '/admin/mock-tests/mock-1/move-to-test':
          if (failMockMutation) return { error: { status: 409, data: { error: 'Mock mutation rejected' } } };
          return {
            data: {
              mock: {
                id: 'mock-1',
                parent: { kind: 'standalone' },
                versionId: 'version-a',
                title: 'Mock',
                description: '',
                status: 'archived',
                isLive: false,
                mockOrder: null,
                passingPercentage: null,
              },
              test: { id: 'test-1', kind: 'test', rotationVersions: [{ versionId: 'version-a' }] },
            },
          };
        case '/admin/mock-tests/mock-1/duplicate-into-test':
          if (failMockMutation) return { error: { status: 409, data: { error: 'Mock mutation rejected' } } };
          return {
            data: {
              mock: {
                id: 'mock-1',
                parent: { kind: 'standalone' },
                versionId: 'version-a',
                title: 'Mock',
                description: '',
                status: 'active',
                isLive: true,
                mockOrder: 0,
                passingPercentage: null,
              },
              test: { id: 'test-1', kind: 'test', rotationVersions: [{ versionId: 'version-copy' }] },
              version: {
                id: 'version-copy',
                name: 'Copy',
                pages: [],
                totalPages: 0,
                totalItems: 0,
                totalExercises: 0,
                totalPoints: 0,
              },
            },
          };
        case '/admin/mock-tests/mock-1/reactivate':
          if (failMockMutation) return { error: { status: 409, data: { error: 'Mock mutation rejected' } } };
          return {
            data: {
              mock: {
                id: 'mock-1',
                parent: { kind: 'standalone' },
                versionId: 'version-a',
                title: 'Mock',
                description: '',
                status: 'active',
                isLive: true,
                mockOrder: 0,
                passingPercentage: null,
              },
            },
          };
        case '/admin/mock-tests/mock-1/version':
          if (failMockMutation) return { error: { status: 409, data: { error: 'Mock mutation rejected' } } };
          return {
            data: {
              version: {
                id: 'version-a',
                name: 'Updated',
                pages: [],
                totalPages: 0,
                totalItems: 0,
                totalExercises: 0,
                totalPoints: 0,
              },
            },
          };
        case '/admin/mock-tests':
        case '/admin/mock-tests/mock-1':
        case '/admin/mock-tests/mock-1/archive':
          if (failMockMutation) return { error: { status: 409, data: { error: 'Mock mutation rejected' } } };
          return {
            data: {
              mock: {
                id: 'mock-1',
                parent: { kind: 'standalone' },
                versionId: 'version-a',
                title: 'Mock',
                description: '',
                status: 'active',
                isLive: true,
                mockOrder: 0,
                passingPercentage: null,
              },
              version: {
                id: 'version-a',
                name: 'Version A',
                pages: [],
                totalPages: 0,
                totalItems: 0,
                totalExercises: 0,
                totalPoints: 0,
              },
              mocks: [],
            },
          };
        default:
          throw new Error(`Unexpected request: ${String(requestUrl(request))}`);
      }
    });
  });

  it('refetches an active dashboard after practice publication changes', async () => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;

    await store.dispatch(
      lessonApi.endpoints.updateLessonsPublishStatus.initiate({
        lessonIds: ['vocab-1'],
        isLive: true,
        lessonType: 'vocab',
        expectedLiveLessonIds: [],
      })
    );

    await waitFor(() =>
      expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
        2
      )
    );
    dashboard.unsubscribe();
  });

  it('refetches an active dashboard after practice category membership changes', async () => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;

    await store.dispatch(
      practiceCategoryApi.endpoints.addPracticeCategoryLessons.initiate({
        categoryId: 'category-1',
        lessonIds: ['vocab-1'],
      })
    );

    await waitFor(() =>
      expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
        2
      )
    );
    dashboard.unsubscribe();
  });

  it.each([
    [
      'tag definition',
      (store: ReturnType<typeof createStore>) =>
        store.dispatch(
          practiceCategoryApi.endpoints.createPracticeTag.initiate({
            categoryId: 'category-1',
            name: 'Cicero',
          })
        ),
    ],
    [
      'membership tag assignment',
      (store: ReturnType<typeof createStore>) =>
        store.dispatch(
          practiceCategoryApi.endpoints.updatePracticeMembershipTags.initiate({
            categoryId: 'category-1',
            lessonId: 'vocab-1',
            tagIds: ['cicero'],
          })
        ),
    ],
  ])('refetches an active dashboard after a successful %s change', async (_label, mutate) => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;

    await mutate(store);

    await waitFor(() =>
      expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
        2
      )
    );
    dashboard.unsubscribe();
  });

  it('does not refetch the dashboard after a rejected practice mutation', async () => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;
    failPublication = true;

    await store.dispatch(
      lessonApi.endpoints.updateLessonsPublishStatus.initiate({
        lessonIds: ['vocab-1'],
        isLive: true,
        lessonType: 'vocab',
        expectedLiveLessonIds: [],
      })
    );

    expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
      1
    );
    dashboard.unsubscribe();
  });

  it('does not refetch dashboard or detail caches after rejected progress', async () => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    const detail = store.dispatch(
      lessonApi.endpoints.getStudentLesson.initiate({
        userId: 'student-1',
        lessonId: 'lesson-1',
      })
    );
    await Promise.all([dashboard, detail]);
    failProgress = true;

    await store.dispatch(
      lessonApi.endpoints.markExerciseComplete.initiate({
        userId: 'student-1',
        lessonId: 'lesson-1',
        exerciseId: 'exercise-1',
        score: 1,
      })
    );

    expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
      1
    );
    expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/lessons/lesson-1')).toHaveLength(1);
    dashboard.unsubscribe();
    detail.unsubscribe();
  });

  it('refetches active dashboards after placed-test version metadata changes', async () => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;

    await store.dispatch(
      testApi.endpoints.updateTest.initiate({
        id: 'test-1',
        changes: {
          versionId: 'version-a',
          test: { title: 'Test', description: '', passingPercentage: null },
          version: { name: 'Updated Version', pages: [] },
        },
      })
    );

    await waitFor(() =>
      expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
        2
      )
    );
    dashboard.unsubscribe();
  });

  it.each([
    [
      'createStandaloneMock',
      () =>
        mockTestApi.endpoints.createStandaloneMock.initiate({
          mock: { id: 'mock-1', title: 'Mock', description: '', passingPercentage: null, isLive: true },
          version: { id: 'version-a', name: 'Version A', pages: [] },
        }),
    ],
    [
      'assignMock',
      () =>
        mockTestApi.endpoints.assignMock.initiate({
          testId: 'test-1',
          versionId: 'version-a',
          title: 'Mock',
          description: '',
          passingPercentage: null,
          isLive: true,
        }),
    ],
    ['updateMock', () => mockTestApi.endpoints.updateMock.initiate({ id: 'mock-1', body: {} })],
    ['archiveMock', () => mockTestApi.endpoints.archiveMock.initiate('mock-1')],
    [
      'reactivateStandaloneMock',
      () => mockTestApi.endpoints.reactivateStandaloneMock.initiate({ id: 'mock-1', body: { isLive: true } }),
    ],
    [
      'moveMockToTest',
      () => mockTestApi.endpoints.moveMockToTest.initiate({ id: 'mock-1', body: { testId: 'test-1' } }),
    ],
    [
      'duplicateMockIntoTest',
      () =>
        mockTestApi.endpoints.duplicateMockIntoTest.initiate({
          id: 'mock-1',
          body: { testId: 'test-1', requestId: 'copy-request' },
        }),
    ],
    ['reorderMocks', () => mockTestApi.endpoints.reorderMocks.initiate({ mockIds: ['mock-1'] })],
  ])('refetches active dashboards after successful mock mutation: %s', async (_name, startMutation) => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;

    await store.dispatch(startMutation() as never);

    await waitFor(() =>
      expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
        2
      )
    );
    dashboard.unsubscribe();
  });

  it.each([
    [
      'assignMock',
      () =>
        mockTestApi.endpoints.assignMock.initiate({
          testId: 'test-1',
          versionId: 'version-a',
          title: 'Mock',
          description: '',
          passingPercentage: null,
          isLive: true,
        }),
    ],
    [
      'moveMockToTest',
      () => mockTestApi.endpoints.moveMockToTest.initiate({ id: 'mock-1', body: { testId: 'test-1' } }),
    ],
    [
      'duplicateMockIntoTest',
      () =>
        mockTestApi.endpoints.duplicateMockIntoTest.initiate({
          id: 'mock-1',
          body: { testId: 'test-1', requestId: 'copy-request' },
        }),
    ],
  ])('does not invalidate dashboard after rejected mock mutation: %s', async (_name, startMutation) => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;
    failMockMutation = true;

    await store.dispatch(startMutation() as never);

    expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
      1
    );
    dashboard.unsubscribe();
  });

  it.each([
    [
      'assignMock',
      () =>
        mockTestApi.endpoints.assignMock.initiate({
          testId: 'test-1',
          versionId: 'version-a',
          title: 'Mock',
          description: '',
          passingPercentage: null,
          isLive: true,
        }),
    ],
    [
      'moveMockToTest',
      () => mockTestApi.endpoints.moveMockToTest.initiate({ id: 'mock-1', body: { testId: 'test-1' } }),
    ],
    [
      'duplicateMockIntoTest',
      () =>
        mockTestApi.endpoints.duplicateMockIntoTest.initiate({
          id: 'mock-1',
          body: { testId: 'test-1', requestId: 'copy-request' },
        }),
    ],
  ])('refreshes parent test/version and student mock projections after %s succeeds', async (_name, startMutation) => {
    const store = createStore();
    const detail = store.dispatch(testApi.endpoints.getTestById.initiate('test-1'));
    const mocks = store.dispatch(mockTestApi.endpoints.getMocks.initiate());
    await Promise.all([detail, mocks]);

    await store.dispatch(startMutation() as never);

    await waitFor(() => {
      expect(
        mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/admin/tests/test-1')
      ).toHaveLength(2);
      expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/admin/mock-tests')).toHaveLength(
        2
      );
    });
    detail.unsubscribe();
    mocks.unsubscribe();
  });

  it('keeps parent, version, mock, and dashboard caches stable after rejected assignment', async () => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    const detail = store.dispatch(testApi.endpoints.getTestById.initiate('test-1'));
    const version = store.dispatch(testApi.endpoints.getTestVersionById.initiate('version-a'));
    const mocks = store.dispatch(mockTestApi.endpoints.getMocks.initiate());
    await Promise.all([dashboard, detail, version, mocks]);
    failMockMutation = true;

    await store.dispatch(
      mockTestApi.endpoints.assignMock.initiate({
        testId: 'test-1',
        versionId: 'version-a',
        title: 'Mock',
        description: '',
        passingPercentage: null,
        isLive: true,
      })
    );

    expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
      1
    );
    expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/admin/tests/test-1')).toHaveLength(
      1
    );
    expect(
      mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/admin/test-versions/version-a')
    ).toHaveLength(1);
    expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/admin/mock-tests')).toHaveLength(1);
    dashboard.unsubscribe();
    detail.unsubscribe();
    version.unsubscribe();
    mocks.unsubscribe();
  });

  it.each([
    [
      'start',
      () =>
        testApi.endpoints.startTestAttempt.initiate({
          uid: 'student-1',
          origin: { kind: 'mock-test', mockTestId: 'mock-1' },
        }),
    ],
    ['submit', () => testApi.endpoints.submitTestAttempt.initiate({ uid: 'student-1', attemptId: 'attempt-1' })],
  ])('refreshes mounted student mock cards after successful mock %s', async (_name, mutation) => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;
    await store.dispatch(mutation() as never);
    await waitFor(() =>
      expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === '/student-dashboard')).toHaveLength(
        2
      )
    );
    dashboard.unsubscribe();
  });

  it('invalidates every mock-version projection after a successful edit', async () => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    const detail = store.dispatch(testApi.endpoints.getTestById.initiate('test-1'));
    const version = store.dispatch(testApi.endpoints.getTestVersionById.initiate('version-a'));
    const mocks = store.dispatch(mockTestApi.endpoints.getMocks.initiate());
    const mockDetail = store.dispatch(mockTestApi.endpoints.getMock.initiate('mock-1'));
    await Promise.all([dashboard, detail, version, mocks, mockDetail]);

    await store.dispatch(
      mockTestApi.endpoints.updateMockVersion.initiate({
        mockId: 'mock-1',
        parentTestId: 'test-1',
        versionId: 'version-a',
        changes: { name: 'Updated', pages: [] },
      })
    );

    await waitFor(() => {
      for (const url of [
        '/student-dashboard',
        '/admin/tests/test-1',
        '/admin/test-versions/version-a',
        '/admin/mock-tests',
        '/admin/mock-tests/mock-1',
      ]) {
        expect(mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === url)).toHaveLength(2);
      }
    });
    [dashboard, detail, version, mocks, mockDetail].forEach(subscription => subscription.unsubscribe());
  });
});
