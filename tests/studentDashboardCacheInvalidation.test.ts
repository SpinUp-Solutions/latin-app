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
let dashboardLearningPath: unknown[] = [];
let progressResult: Record<string, unknown> = {};

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
const requestCount = (url: string) =>
  mockBaseQuery.mock.calls.filter(([request]) => requestUrl(request) === url).length;

describe('student dashboard cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    failPublication = false;
    failProgress = false;
    failMockMutation = false;
    dashboardLearningPath = [];
    progressResult = {
      lessonCompleted: false,
      progress: 50,
      furthestPageIndex: 1,
      completedExerciseCount: 1,
      requiredExerciseCount: 2,
      exerciseProgress: [{ exerciseId: 'exercise-1', score: 100, completedAt: 'now' }],
    };
    mockBaseQuery.mockImplementation(async (request: unknown) => {
      switch (requestUrl(request)) {
        case '/student-dashboard':
          return {
            data: {
              dashboard: {
                learningPath: dashboardLearningPath,
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
        case '/progress/student-1/lesson-1/complete':
          if (failProgress) {
            return {
              error: {
                status: 409,
                data: { error: 'Progress rejected' },
              },
            };
          }
          return { data: { success: true, ...progressResult } };
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
        case '/test-attempts/attempt-1/sections/page-1/confirm':
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

    await waitFor(() => expect(requestCount('/student-dashboard')).toBe(2));
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

    await waitFor(() => expect(requestCount('/student-dashboard')).toBe(2));
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

    await waitFor(() => expect(requestCount('/student-dashboard')).toBe(2));
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

    expect(requestCount('/student-dashboard')).toBe(1);
    dashboard.unsubscribe();
  });

  describe('progress writes', () => {
    const ids = { userId: 'student-1', lessonId: 'lesson-1' };
    const pathLesson = (status: string) => ({
      id: 'lesson-1',
      kind: 'lesson',
      status,
      progress: 0,
      furthestPageIndex: -1,
      currentPageIndex: 0,
    });
    const completeExercise = (exerciseId = 'exercise-1') =>
      lessonApi.endpoints.markExerciseComplete.initiate({ ...ids, exerciseId, score: 100 });
    const setup = async (status: string) => {
      dashboardLearningPath = [pathLesson(status)];
      const store = createStore();
      const subscriptions = [
        store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1')),
        store.dispatch(lessonApi.endpoints.getStudentLesson.initiate(ids)),
      ];
      await Promise.all(subscriptions);
      return {
        store,
        lesson: () => lessonApi.endpoints.getStudentLesson.select(ids)(store.getState()).data,
        path: () => lessonApi.endpoints.getStudentDashboard.select('student-1')(store.getState()).data?.learningPath,
        unsubscribe: () => subscriptions.forEach(subscription => subscription.unsubscribe()),
      };
    };

    it.each([
      ['exercise completion', () => completeExercise()],
      ['page visit', () => lessonApi.endpoints.updatePageProgress.initiate({ ...ids, pageId: 'page-2' })],
    ])('adopts the persisted summary for %s without refetching the lesson or dashboard', async (_name, mutate) => {
      const { store, lesson, path, unsubscribe } = await setup('available');
      await store.dispatch(mutate() as never);

      expect([requestCount('/student-dashboard'), requestCount('/lessons/lesson-1')]).toEqual([1, 1]);
      expect(path()).toEqual([
        { ...pathLesson('in-progress'), progress: 50, furthestPageIndex: 1, currentPageIndex: 1 },
      ]);
      expect(lesson()).toMatchObject({
        status: 'in-progress',
        progress: 50,
        furthestPageIndex: 1,
        completedExerciseCount: 1,
        exerciseProgress: progressResult.exerciseProgress,
      });
      unsubscribe();
    });

    it.each([
      ['a rejected write', 'in-progress', () => (failProgress = true)],
      ['a write to a completed lesson', 'completed', () => (progressResult.lessonCompleted = true)],
    ])('refetches neither the lesson nor the dashboard after %s', async (_name, status, arrange) => {
      const { store, unsubscribe } = await setup(status);
      arrange();
      await store.dispatch(completeExercise());

      expect([requestCount('/student-dashboard'), requestCount('/lessons/lesson-1')]).toEqual([1, 1]);
      unsubscribe();
    });

    it('refetches only the dashboard when the write completes the lesson, since that can unlock the next unit', async () => {
      const { store, lesson, unsubscribe } = await setup('in-progress');
      progressResult = { ...progressResult, lessonCompleted: true, progress: 100 };
      await store.dispatch(lessonApi.endpoints.finishLesson.initiate({ ...ids, finalPageId: 'page-2' }));

      await waitFor(() => expect(requestCount('/student-dashboard')).toBe(2));
      expect(requestCount('/lessons/lesson-1')).toBe(1);
      expect(lesson()).toMatchObject({ status: 'completed', progress: 100 });
      unsubscribe();
    });

    it('refetches the dashboard when the lesson completes before its first response arrives', async () => {
      const nextLesson = (status: string) => ({ ...pathLesson(status), id: 'lesson-2' });
      const path = (learningPath: unknown[]) => ({ learningPath, practiceLessons: [], mockTests: [] });
      // The first dashboard read started before the completion write, so it still reports the next lesson locked.
      let releaseStaleDashboard = () => {};
      mockBaseQuery.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseStaleDashboard = () =>
              resolve({ data: { dashboard: path([pathLesson('in-progress'), nextLesson('locked')]) } });
          })
      );
      dashboardLearningPath = [pathLesson('completed'), nextLesson('available')];
      progressResult = { ...progressResult, lessonCompleted: true, progress: 100 };
      const store = createStore();
      const subscription = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
      await waitFor(() => expect(requestCount('/student-dashboard')).toBe(1));

      await store.dispatch(lessonApi.endpoints.finishLesson.initiate({ ...ids, finalPageId: 'page-2' }));
      releaseStaleDashboard();

      await waitFor(() => expect(requestCount('/student-dashboard')).toBe(2));
      await waitFor(() =>
        expect(
          lessonApi.endpoints.getStudentDashboard.select('student-1')(store.getState()).data?.learningPath
        ).toEqual(dashboardLearningPath)
      );
      subscription.unsubscribe();
    });

    it('keeps the newer summary when concurrent exercise writes resolve out of order', async () => {
      const { store, lesson, path, unsubscribe } = await setup('in-progress');
      const responses: Array<(data: unknown) => void> = [];
      mockBaseQuery.mockImplementation(() => new Promise(resolve => responses.push(data => resolve({ data }))));
      const [one, two] = ['exercise-1', 'exercise-2'].map(id => ({ exerciseId: id, score: 100, completedAt: id }));
      const summary = (count: number, progress: number) => ({
        ...progressResult,
        progress,
        furthestPageIndex: 2,
        completedExerciseCount: count,
        exerciseProgress: [one, two].slice(0, count),
      });

      const first = store.dispatch(completeExercise('exercise-1'));
      const second = store.dispatch(completeExercise('exercise-2'));
      await waitFor(() => expect(responses).toHaveLength(2));
      responses[1](summary(2, 67));
      await second;
      responses[0](summary(1, 33));
      await first;

      expect(lesson()).toMatchObject({ progress: 67, completedExerciseCount: 2, exerciseProgress: [one, two] });
      expect(path()?.[0]).toMatchObject({ status: 'in-progress', progress: 67, furthestPageIndex: 2 });
      unsubscribe();
    });
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

    await waitFor(() => expect(requestCount('/student-dashboard')).toBe(2));
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

    await waitFor(() => expect(requestCount('/student-dashboard')).toBe(2));
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

    expect(requestCount('/student-dashboard')).toBe(1);
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
      expect(requestCount('/admin/tests/test-1')).toBe(2);
      expect(requestCount('/admin/mock-tests')).toBe(2);
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

    expect(requestCount('/student-dashboard')).toBe(1);
    expect(requestCount('/admin/tests/test-1')).toBe(1);
    expect(requestCount('/admin/test-versions/version-a')).toBe(1);
    expect(requestCount('/admin/mock-tests')).toBe(1);
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
    [
      'final section confirmation',
      () =>
        testApi.endpoints.confirmTestSection.initiate({
          uid: 'student-1',
          attemptId: 'attempt-1',
          pageId: 'page-1',
          expectedRevision: 0,
          requestId: '9f0c2f5e-4d5b-4a8e-9a55-3c3f2a1b7c10',
          acknowledgeIncomplete: false,
        }),
    ],
  ])('refreshes mounted student mock cards after successful mock %s', async (_name, mutation) => {
    const store = createStore();
    const dashboard = store.dispatch(lessonApi.endpoints.getStudentDashboard.initiate('student-1'));
    await dashboard;
    await store.dispatch(mutation() as never);
    await waitFor(() => expect(requestCount('/student-dashboard')).toBe(2));
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
        expect(requestCount(url)).toBe(2);
      }
    });
    [dashboard, detail, version, mocks, mockDetail].forEach(subscription => subscription.unsubscribe());
  });
});
