import React, { Suspense } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudentTestPage from '@/src/app/test/[testId]/page';
import type { StudentDashboard } from '@/src/types/lesson';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockStartAttempt = jest.fn();
const mockSaveAnswers = jest.fn();
const mockGradeTranslation = jest.fn();
const mockSubmitAttempt = jest.fn();
const mockUseGetStudentDashboardQuery = jest.fn();
const mockUseGetStudentMockDetailQuery = jest.fn();
const mockSearchParams = jest.fn();
const mockRefetchMockDetail = jest.fn();
const mockRefetchDashboard = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useSearchParams: () => mockSearchParams(),
}));

jest.mock('@/src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'student-1' },
    loading: false,
  }),
}));

jest.mock('@/src/store/api/lessonApi', () => ({
  useGetStudentDashboardQuery: () => mockUseGetStudentDashboardQuery(),
}));

jest.mock('@/src/store/api/mockTestApi', () => ({
  useGetStudentMockDetailQuery: () => mockUseGetStudentMockDetailQuery(),
}));

jest.mock('@/src/store/api/testApi', () => ({
  useStartTestAttemptMutation: () => [mockStartAttempt, { isLoading: false }],
  useSaveTestAttemptAnswersMutation: () => [mockSaveAnswers],
  useGradeTestTranslationMutation: () => [mockGradeTranslation, { isLoading: false }],
  useSubmitTestAttemptMutation: () => [mockSubmitAttempt, { isLoading: false }],
}));

jest.mock('@/src/components/ui/lesson/page-template', () => ({
  PageTemplate: ({
    onAnswer,
  }: {
    onAnswer: (event: { exerciseId: string; answer: { type: 'fill'; answers: string[] } }) => void;
  }) => (
    <button
      onClick={() => {
        onAnswer({
          exerciseId: 'fill-one',
          answer: { type: 'fill', answers: ['one'] },
        });
        onAnswer({
          exerciseId: 'fill-two',
          answer: { type: 'fill', answers: ['two'] },
        });
      }}>
      Record two answers
    </button>
  ),
}));

const dashboard: StudentDashboard = {
  learningPath: [
    {
      id: 'test-1',
      kind: 'test',
      title: 'Chapter test',
      description: 'Show what you know',
      passingPercentage: 70,
      rotationVersionCount: 1,
      minTotalPoints: 2,
      maxTotalPoints: 2,
      status: 'available',
      attemptSummary: {
        origin: { kind: 'normal-test', testId: 'test-1' },
        inProgressAttemptId: null,
        attemptCount: 0,
        best: null,
        latest: null,
      },
    },
  ],
  practiceLessons: [],
};

const startedAttempt = {
  id: 'attempt-1',
  versionId: 'version-a',
  passingPercentage: 70,
  origin: { kind: 'normal-test' as const, testId: 'test-1' },
  status: 'in-progress' as const,
  answers: {},
  delivery: {
    versionId: 'version-a',
    pages: [
      {
        id: 'page-1',
        items: [
          {
            id: 'fill-one',
            type: 'fill',
            title: 'First',
            maxPoints: 1,
            data: { items: [{ text: 'First' }] },
          },
          {
            id: 'fill-two',
            type: 'fill',
            title: 'Second',
            maxPoints: 1,
            data: { items: [{ text: 'Second' }] },
          },
        ],
      },
    ],
    resolvedExercises: {},
  },
  startedAt: 'now',
  updatedAt: 'now',
};

describe('student normal test flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: jest.fn(),
    });
    mockUseGetStudentDashboardQuery.mockReturnValue({
      data: dashboard,
      isLoading: false,
      isError: false,
      refetch: mockRefetchDashboard,
    });
    mockUseGetStudentMockDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: mockRefetchMockDetail,
    });
    mockSearchParams.mockReturnValue(new URLSearchParams());
    mockStartAttempt.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        attempt: startedAttempt,
        resumed: false,
      }),
    });
    mockSaveAnswers.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue(startedAttempt),
    });
    mockSubmitAttempt.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        completionGranted: false,
        attempt: {
          id: 'attempt-1',
          versionId: 'version-a',
          passingPercentage: 70,
          origin: { kind: 'normal-test', testId: 'test-1' },
          status: 'submitted',
          exerciseResults: {
            'fill-one': {
              title: 'First',
              awardedPoints: 1,
              maxPoints: 1,
            },
            'fill-two': {
              title: 'Second',
              awardedPoints: 0,
              maxPoints: 1,
            },
          },
          score: 1,
          maxScore: 2,
          percentage: 50,
          outcome: 'not-passed',
          startedAt: 'now',
          updatedAt: 'later',
          submittedAt: 'later',
        },
      }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows expectations, coalesces answers before review, and explains a failed result', async () => {
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{
      testId: string;
    }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    expect(await screen.findByText('Score 70% or higher to continue along your Learning Path')).toBeInTheDocument();
    expect(screen.getByText(/answers save automatically/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start Test' }));
    expect(await screen.findByRole('button', { name: 'Record two answers' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record two answers' }));
    expect(screen.getByText('2 of 2 answered')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Answer recorded. Saving…');
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));

    await waitFor(() =>
      expect(mockSaveAnswers).toHaveBeenCalledWith({
        uid: 'student-1',
        attemptId: 'attempt-1',
        answers: {
          'fill-one': { type: 'fill', answers: ['one'] },
          'fill-two': { type: 'fill', answers: ['two'] },
        },
      })
    );
    expect(await screen.findByText('Every exercise has a recorded answer.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));

    expect(await screen.findByText('Keep going')).toBeInTheDocument();
    expect(screen.getByText(/You need 70% — you reached 50%/)).toBeInTheDocument();
    expect(screen.getByText(/20 percentage points away/)).toBeInTheDocument();
    expect(screen.getByText('Results breakdown')).toBeInTheDocument();
  });

  it('reopens a recorded answer from review and clears its server-side value before editing', async () => {
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record two answers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    expect(await screen.findByText('Every exercise has a recorded answer.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit First' }));

    await waitFor(() =>
      expect(mockSaveAnswers).toHaveBeenLastCalledWith({
        uid: 'student-1',
        attemptId: 'attempt-1',
        answers: { 'fill-one': null },
      })
    );
    expect(await screen.findByRole('button', { name: 'Record two answers' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
  });

  it('shows precise percentages and a visible deficit for a near-threshold failure', async () => {
    mockUseGetStudentDashboardQuery.mockReturnValue({
      data: {
        ...dashboard,
        learningPath: dashboard.learningPath.map(unit =>
          unit.kind === 'test' ? { ...unit, passingPercentage: 80 } : unit
        ),
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetchDashboard,
    });
    mockSubmitAttempt.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        completionGranted: false,
        attempt: {
          id: 'attempt-1',
          versionId: 'version-a',
          passingPercentage: 80,
          origin: { kind: 'normal-test', testId: 'test-1' },
          status: 'submitted',
          exerciseResults: {},
          score: 79.999,
          maxScore: 100,
          percentage: 79.999,
          outcome: 'not-passed',
          startedAt: 'now',
          updatedAt: 'later',
          submittedAt: 'later',
        },
      }),
    });
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review answers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Test' }));

    expect(await screen.findByText('79.99%')).toBeInTheDocument();
    expect(screen.getByText(/You need 80% — you reached 79\.99%/)).toBeInTheDocument();
    expect(screen.getByText(/<0\.01 percentage points away/)).toBeInTheDocument();
  });

  it('keeps partial multi-item answers out of the answered count and protects them before unload', async () => {
    mockStartAttempt.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        attempt: {
          ...startedAttempt,
          delivery: {
            ...startedAttempt.delivery,
            pages: [
              {
                ...startedAttempt.delivery.pages[0],
                items: [
                  {
                    ...startedAttempt.delivery.pages[0].items[0],
                    data: {
                      items: [{ text: 'First part' }, { text: 'Second part' }],
                    },
                  },
                  startedAttempt.delivery.pages[0].items[1],
                ],
              },
            ],
          },
        },
        resumed: false,
      }),
    });
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record two answers' }));

    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    expect(fireEvent(window, beforeUnload)).toBe(false);
    expect(beforeUnload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    expect(await screen.findByText('1 unanswered exercise')).toBeInTheDocument();
    expect(screen.queryByText('Every exercise has a recorded answer.')).not.toBeInTheDocument();
  });

  it('flushes pending answers before replaying browser history navigation', async () => {
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };
    const nextHistoryState = {
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: { segment: 'test-1' },
    };
    window.history.replaceState(nextHistoryState, '', '/test/test-1');
    const pushState = jest.spyOn(window.history, 'pushState');
    const go = jest.spyOn(window.history, 'go').mockImplementation(() => undefined);
    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Test' }));
    await waitFor(() =>
      expect(pushState).toHaveBeenCalledWith(
        {
          ...nextHistoryState,
          __latinTestHistoryGuard: 'test:normal-test:test-1',
        },
        '',
        window.location.href
      )
    );
    expect(window.history.state).toEqual({
      ...nextHistoryState,
      __latinTestHistoryGuard: 'test:normal-test:test-1',
    });
    const guardInstallCount = pushState.mock.calls.length;

    fireEvent.click(await screen.findByRole('button', { name: 'Record two answers' }));
    fireEvent.popState(window, { state: nextHistoryState });

    await waitFor(() => expect(mockSaveAnswers).toHaveBeenCalled());
    expect(pushState).toHaveBeenCalledTimes(guardInstallCount + 1);
    expect(pushState).toHaveBeenLastCalledWith(
      {
        ...nextHistoryState,
        __latinTestHistoryGuard: 'test:normal-test:test-1',
      },
      '',
      window.location.href
    );
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-2);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('reinstalls the same-route guard with Next state intact when a history flush fails', async () => {
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };
    const nextHistoryState = {
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: { segment: 'test-1' },
    };
    window.history.replaceState(nextHistoryState, '', '/test/test-1');
    mockSaveAnswers.mockReturnValue({
      unwrap: jest.fn().mockRejectedValue(new Error('offline')),
    });
    const pushState = jest.spyOn(window.history, 'pushState');
    const go = jest.spyOn(window.history, 'go').mockImplementation(() => undefined);

    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record two answers' }));
    fireEvent.popState(window, { state: nextHistoryState });

    await waitFor(() => expect(pushState).toHaveBeenCalledTimes(2));
    expect(pushState).toHaveBeenLastCalledWith(
      {
        ...nextHistoryState,
        __latinTestHistoryGuard: 'test:normal-test:test-1',
      },
      '',
      window.location.href
    );
    expect(mockBack).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it('coalesces repeated Back presses while a history-triggered save is pending', async () => {
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };
    const nextHistoryState = {
      __NA: true,
      __PRIVATE_NEXTJS_INTERNALS_TREE: { segment: 'test-1' },
    };
    window.history.replaceState(nextHistoryState, '', '/test/test-1');
    let resolveSave!: (attempt: typeof startedAttempt) => void;
    const deferredSave = new Promise<typeof startedAttempt>(resolve => {
      resolveSave = resolve;
    });
    mockSaveAnswers.mockReturnValue({
      unwrap: jest.fn().mockReturnValue(deferredSave),
    });
    const pushState = jest.spyOn(window.history, 'pushState');
    const go = jest.spyOn(window.history, 'go').mockImplementation(() => undefined);

    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record two answers' }));

    fireEvent.popState(window, { state: nextHistoryState });
    await waitFor(() => expect(mockSaveAnswers).toHaveBeenCalledTimes(1));
    fireEvent.popState(window, { state: nextHistoryState });

    expect(mockSaveAnswers).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledTimes(3);
    expect(go).not.toHaveBeenCalled();

    await act(async () => {
      resolveSave(startedAttempt);
      await deferredSave;
    });

    await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
    expect(go).toHaveBeenCalledWith(-2);
  });

  it.each(['hidden', 'archived', 'moved'])('resumes the frozen mock attempt after it is %s', async _state => {
    mockSearchParams.mockReturnValue(new URLSearchParams('origin=mock'));
    mockUseGetStudentDashboardQuery.mockReturnValue({
      data: {
        ...dashboard,
        mockTests: [
          {
            id: 'test-1',
            title: 'Mock with same id',
            description: '',
            passingPercentage: null,
            totalPoints: 2,
            attemptSummary: {
              origin: { kind: 'mock-test', mockTestId: 'test-1' },
              inProgressAttemptId: null,
              attemptCount: 0,
              best: null,
              latest: null,
            },
            scoreTrend: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mockUseGetStudentMockDetailQuery.mockReturnValue({
      data: {
        mock: {
          id: 'test-1',
          title: 'Practice test',
          description: '',
          passingPercentage: 70,
          status: 'archived',
          isLive: false,
        },
        attempt: { ...startedAttempt, origin: { kind: 'mock-test', mockTestId: 'test-1' } },
      },
      isLoading: false,
      isError: false,
    });
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };

    const rendered = render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    expect(await screen.findByRole('button', { name: 'Continue Mock Test' })).toBeInTheDocument();
    expect(screen.queryByText('Test in progress')).not.toBeInTheDocument();
    expect(mockStartAttempt).toHaveBeenCalledWith({
      uid: 'student-1',
      origin: { kind: 'mock-test', mockTestId: 'test-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue Mock Test' }));
    expect(await screen.findByText('Test in progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record two answers' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record two answers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    expect(await screen.findByText('Every exercise has a recorded answer.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Test' }));
    expect(await screen.findByText('Keep going')).toBeInTheDocument();
    expect(mockSaveAnswers).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 'attempt-1' }));
    expect(mockSubmitAttempt).toHaveBeenCalledWith({ uid: 'student-1', attemptId: 'attempt-1' });
    mockUseGetStudentMockDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchMockDetail,
    });
    rendered.rerender(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );
    expect(screen.getByText('Keep going')).toBeInTheDocument();
    expect(screen.getByText('This mock test is no longer available for another attempt.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retake Mock Test' })).not.toBeInTheDocument();
  });

  it('never offers a retake from the stale mock detail after submit when the refreshed live card is gone', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams('origin=mock'));
    let resolveDashboardRefresh!: (value: unknown) => void;
    let resolveMockDetailRefresh!: (value: unknown) => void;
    const dashboardRefresh = new Promise<unknown>(resolve => {
      resolveDashboardRefresh = resolve;
    });
    const mockDetailRefresh = new Promise<unknown>(resolve => {
      resolveMockDetailRefresh = resolve;
    });
    const liveMock = {
      id: 'mock-1',
      title: 'Practice mock',
      description: '',
      passingPercentage: 70,
      totalPoints: 2,
      attemptSummary: {
        origin: { kind: 'mock-test' as const, mockTestId: 'mock-1' },
        inProgressAttemptId: null,
        attemptCount: 0,
        best: null,
        latest: null,
      },
      scoreTrend: [],
    };
    mockUseGetStudentDashboardQuery.mockReturnValue({
      data: { ...dashboard, mockTests: [liveMock] },
      isLoading: false,
      isError: false,
      refetch: mockRefetchDashboard,
    });
    mockUseGetStudentMockDetailQuery.mockReturnValue({
      data: {
        mock: {
          id: 'mock-1',
          title: 'Practice mock',
          description: '',
          passingPercentage: 70,
          status: 'active',
          isLive: true,
        },
        attempt: null,
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetchMockDetail,
    });
    mockStartAttempt.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        attempt: { ...startedAttempt, origin: { kind: 'mock-test', mockTestId: 'mock-1' } },
        resumed: false,
      }),
    });
    // Keep the result fixture explicit: a mock result is valid even after its card disappears.
    mockSubmitAttempt.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({
        completionGranted: false,
        attempt: {
          id: 'attempt-1',
          versionId: 'version-a',
          passingPercentage: 70,
          origin: { kind: 'mock-test', mockTestId: 'mock-1' },
          status: 'submitted',
          exerciseResults: {},
          score: 1,
          maxScore: 2,
          percentage: 50,
          outcome: 'not-passed',
          startedAt: 'now',
          updatedAt: 'later',
          submittedAt: 'later',
        },
      }),
    });
    mockRefetchDashboard.mockReturnValue(dashboardRefresh);
    mockRefetchMockDetail.mockReturnValue(mockDetailRefresh);
    const params = Promise.resolve({ testId: 'mock-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'mock-1' };

    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start Mock Test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Begin Mock Test' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record two answers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review answers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Test' }));

    expect(await screen.findByText('Keep going')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading retake options' })).toBeInTheDocument();
    expect(screen.queryByText(/Checking whether this mock is still available/)).not.toBeInTheDocument();
    resolveDashboardRefresh({ data: { ...dashboard, mockTests: [] } });
    resolveMockDetailRefresh({
      data: {
        mock: {
          id: 'mock-1',
          title: 'Practice mock',
          description: '',
          passingPercentage: 70,
          status: 'archived',
          isLive: false,
        },
        attempt: null,
      },
    });
    await waitFor(() =>
      expect(screen.getByText('This mock test is no longer available for another attempt.')).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: 'Retake Mock Test' })).not.toBeInTheDocument();
  });

  it('retries the failing mock-detail source', async () => {
    mockSearchParams.mockReturnValue(new URLSearchParams('origin=mock'));
    mockUseGetStudentMockDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchMockDetail,
    });
    const params = Promise.resolve({ testId: 'mock-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'mock-1' };

    render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(mockRefetchMockDetail).toHaveBeenCalled();
    expect(mockRefetchDashboard).toHaveBeenCalled();
  });

  it('resets local state and installs a distinct sentinel when the same id switches from normal to mock origin', async () => {
    const params = Promise.resolve({ testId: 'test-1' }) as Promise<{ testId: string }> & {
      status: 'fulfilled';
      value: { testId: string };
    };
    params.status = 'fulfilled';
    params.value = { testId: 'test-1' };
    const pushState = jest.spyOn(window.history, 'pushState');
    const rendered = render(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Test' }));
    expect(await screen.findByText('Test in progress')).toBeInTheDocument();

    mockSearchParams.mockReturnValue(new URLSearchParams('origin=mock'));
    mockUseGetStudentDashboardQuery.mockReturnValue({
      data: {
        ...dashboard,
        mockTests: [
          {
            id: 'test-1',
            title: 'Mock with same id',
            description: '',
            passingPercentage: null,
            totalPoints: 2,
            attemptSummary: {
              origin: { kind: 'mock-test', mockTestId: 'test-1' },
              inProgressAttemptId: null,
              attemptCount: 0,
              best: null,
              latest: null,
            },
            scoreTrend: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    mockUseGetStudentMockDetailQuery.mockReturnValue({
      data: {
        mock: {
          id: 'test-1',
          title: 'Mock with same id',
          description: '',
          passingPercentage: null,
          status: 'active',
          isLive: true,
        },
        attempt: null,
      },
      isLoading: false,
      isError: false,
    });
    rendered.rerender(
      <Suspense fallback={<div>Loading route</div>}>
        <StudentTestPage params={params} />
      </Suspense>
    );

    expect(await screen.findByRole('button', { name: 'Start Mock Test' })).toBeInTheDocument();
    expect(screen.queryByText('Test in progress')).not.toBeInTheDocument();
    expect(pushState).toHaveBeenLastCalledWith(
      expect.objectContaining({ __latinTestHistoryGuard: 'test:mock-test:test-1' }),
      '',
      window.location.href
    );
  });
});
