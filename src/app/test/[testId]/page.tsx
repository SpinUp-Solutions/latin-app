'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileCheck2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { TestTakingView } from '@/src/components/ui/test/test-taking-view';
import { TestTranslationGradingProvider } from '@/src/components/ui/test/test-translation-grading-context';
import { useAuth } from '@/src/hooks/useAuth';
import { useBufferedAttemptAnswers } from '@/src/hooks/useBufferedAttemptAnswers';
import { isExerciseType } from '@/src/lib/content/registry';
import { isExerciseAnswerComplete } from '@/src/lib/tests/answer-completion';
import { getApiErrorCode, getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useGetStudentDashboardQuery } from '@/src/store/api/lessonApi';
import { useGetStudentMockDetailQuery } from '@/src/store/api/mockTestApi';
import {
  useGradeTestTranslationMutation,
  useStartTestAttemptMutation,
  useSubmitTestAttemptMutation,
} from '@/src/store/api/testApi';
import type { StudentTestSummary } from '@/src/types/lesson';
import type { TestTranslationGradeEvent, TestTranslationGradeFeedback } from '@/src/types/runtime-mode';
import type { TestAttemptOrigin } from '@/src/types/test';
import type { StudentInProgressTestAttempt, StudentSubmittedTestAttempt } from '@/src/types/test';

const TEST_HISTORY_GUARD_KEY = '__latinTestHistoryGuard';

const formatPoints = (value: number) =>
  value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');

type Screen = 'expectations' | 'taking' | 'review' | 'results' | 'unavailable';
type MockRetakeAvailability = 'unchecked' | 'checking' | 'available' | 'unavailable';

export default function StudentTestPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = React.use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMockTest = searchParams.get('origin') === 'mock';
  const { user, loading: authLoading } = useAuth();
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useGetStudentDashboardQuery(user?.uid ?? '', { skip: !user?.uid });
  const {
    data: mockDetail,
    isLoading: mockDetailLoading,
    isError: mockDetailError,
    refetch: refetchMockDetail,
  } = useGetStudentMockDetailQuery({ uid: user?.uid ?? '', mockId: testId }, { skip: !user?.uid || !isMockTest });
  const [startAttempt, { isLoading: starting }] = useStartTestAttemptMutation();
  const [gradeTestTranslation, { isLoading: translationGrading }] = useGradeTestTranslationMutation();
  const [submitAttempt, { isLoading: submitting }] = useSubmitTestAttemptMutation();
  const {
    activateAttempt,
    adoptPersistedAnswer,
    answers,
    flushPendingAnswers,
    hasUnsavedAnswers,
    recordAnswer,
    reset: resetAnswerBuffer,
    saveError,
    saveStatus: answerSaveStatus,
  } = useBufferedAttemptAnswers();

  const [screen, setScreen] = useState<Screen>('expectations');
  const [attempt, setAttempt] = useState<StudentInProgressTestAttempt | null>(null);
  const [result, setResult] = useState<StudentSubmittedTestAttempt | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [mockRetakeAvailability, setMockRetakeAvailability] = useState<MockRetakeAvailability>('unchecked');
  const allowNextHistoryPopRef = useRef(false);
  const historyNavigationPendingRef = useRef(false);
  const historyEffectActiveRef = useRef(false);
  const mockResumeScopeRef = useRef<string | null>(null);

  const normalTest = dashboard?.learningPath.find(
    (unit): unit is StudentTestSummary => unit.id === testId && unit.kind === 'test'
  );
  const mockTest = isMockTest ? dashboard?.mockTests?.find(mock => mock.id === testId) : undefined;
  const mockInfo = mockTest ?? mockDetail?.mock;
  const test = isMockTest ? mockInfo : normalTest;
  const attemptSummary = isMockTest ? mockTest?.attemptSummary : normalTest?.attemptSummary;
  const origin = useMemo<TestAttemptOrigin>(
    () => (isMockTest ? { kind: 'mock-test', mockTestId: testId } : { kind: 'normal-test', testId }),
    [isMockTest, testId]
  );
  const originKey = `${origin.kind}:${testId}`;
  const activeOriginKeyRef = useRef(originKey);

  // Query-origin changes reuse this client component in Next. Do not carry a
  // normal attempt, local answers, result, or history sentinel into a mock
  // that happens to use the same document id (or vice versa).
  useEffect(() => {
    activeOriginKeyRef.current = originKey;
    resetAnswerBuffer();
    allowNextHistoryPopRef.current = false;
    historyNavigationPendingRef.current = false;
    mockResumeScopeRef.current = null;
    setAttempt(null);
    setResult(null);
    setPageIndex(0);
    setMockRetakeAvailability('unchecked');
    setScreen('expectations');
  }, [originKey, resetAnswerBuffer]);

  useEffect(() => {
    if (!isMockTest || screen !== 'results' || !result) return;
    if (mockDetailError || mockDetail?.mock.status !== 'active' || !mockDetail.mock.isLive) {
      setMockRetakeAvailability('unavailable');
    }
  }, [isMockTest, mockDetail?.mock.isLive, mockDetail?.mock.status, mockDetailError, result, screen]);

  // This authorized detail projection is intentionally independent of the
  // live dashboard list. It proves that this origin has a frozen delivery;
  // starting that existing session then restores the withheld answer payload.
  // A fresh inactive mock never gets this projection and remains start-denied.
  useEffect(() => {
    if (!isMockTest || !mockDetail?.attempt || activeOriginKeyRef.current !== originKey) return;
    const resumeScope = `${originKey}:${mockDetail.attempt.id}`;
    if (mockResumeScopeRef.current === resumeScope || !user) return;
    mockResumeScopeRef.current = resumeScope;
    void startAttempt({ uid: user.uid, origin })
      .unwrap()
      .then(response => {
        if (activeOriginKeyRef.current !== originKey) return;
        activateAttempt({
          answers: response.attempt.answers,
          attemptId: response.attempt.id,
          originKey,
          uid: user.uid,
        });
        setAttempt(response.attempt);
        setPageIndex(0);
        setScreen('taking');
      })
      .catch(error => {
        if (activeOriginKeyRef.current !== originKey) return;
        if (getApiErrorCode(error) === 'TEST_CONFIGURATION_ERROR' || getApiErrorCode(error) === 'TEST_NOT_AVAILABLE') {
          setScreen('unavailable');
          return;
        }
        toast.error(getApiErrorMessage(error, 'Unable to resume this mock test'));
      });
  }, [activateAttempt, isMockTest, mockDetail?.attempt, origin, originKey, startAttempt, user]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, router, user]);

  const exerciseItems = useMemo(
    () =>
      attempt?.delivery.pages.flatMap((page, deliveryPageIndex) =>
        page.items
          .filter(item => isExerciseType(item.type))
          .map(item => ({
            id: item.id,
            title: item.title || 'Untitled exercise',
            pageIndex: deliveryPageIndex,
            exercise: item,
            resolvedItemCount: attempt.delivery.resolvedExercises[item.id]?.items.length ?? 0,
          }))
      ) ?? [],
    [attempt]
  );
  const answeredCount = useMemo(
    () =>
      exerciseItems.filter(item => isExerciseAnswerComplete(item.exercise, answers[item.id], item.resolvedItemCount))
        .length,
    [answers, exerciseItems]
  );

  useEffect(() => {
    let effectActive = true;
    historyEffectActiveRef.current = true;
    const guardValue = `test:${originKey}`;
    const installSameRouteGuard = (baseState: unknown = window.history.state) => {
      const historyState = baseState && typeof baseState === 'object' ? (baseState as Record<string, unknown>) : {};
      if (historyState[TEST_HISTORY_GUARD_KEY] === guardValue) return;
      window.history.pushState(
        {
          ...historyState,
          [TEST_HISTORY_GUARD_KEY]: guardValue,
        },
        '',
        window.location.href
      );
    };

    installSameRouteGuard();

    const continueHistoryNavigation = () => {
      if (!effectActive && !historyEffectActiveRef.current) return;
      historyNavigationPendingRef.current = false;
      allowNextHistoryPopRef.current = true;
      window.history.go(-2);
    };

    const protectHistoryNavigation = (event: PopStateEvent) => {
      if (allowNextHistoryPopRef.current) {
        allowNextHistoryPopRef.current = false;
        return;
      }
      if (
        event.state &&
        typeof event.state === 'object' &&
        (event.state as Record<string, unknown>)[TEST_HISTORY_GUARD_KEY] === guardValue
      ) {
        return;
      }

      // The first Back lands on the original same-route entry. Reinstall the
      // sentinel immediately so repeated Back presses cannot leave the test
      // while the pending save is still in flight.
      installSameRouteGuard(event.state);
      if (historyNavigationPendingRef.current) return;
      historyNavigationPendingRef.current = true;

      if (!hasUnsavedAnswers()) {
        continueHistoryNavigation();
        return;
      }
      void flushPendingAnswers()
        .then(continueHistoryNavigation)
        .catch(() => {
          if (!effectActive && !historyEffectActiveRef.current) return;
          historyNavigationPendingRef.current = false;
          toast.error('Save the pending answer before leaving this test.');
        });
    };
    window.addEventListener('popstate', protectHistoryNavigation);
    return () => {
      effectActive = false;
      historyEffectActiveRef.current = false;
      window.removeEventListener('popstate', protectHistoryNavigation);
    };
  }, [flushPendingAnswers, hasUnsavedAnswers, originKey]);

  const begin = async () => {
    if (!user || !test || (isMockTest && !mockTest) || normalTest?.status === 'locked') return;
    const requestedOriginKey = originKey;
    try {
      const response = await startAttempt({ uid: user.uid, origin }).unwrap();
      if (activeOriginKeyRef.current !== requestedOriginKey) return;
      activateAttempt({
        answers: response.attempt.answers,
        attemptId: response.attempt.id,
        originKey: requestedOriginKey,
        uid: user.uid,
      });
      setAttempt(response.attempt);
      setPageIndex(0);
      setScreen('taking');
    } catch (error) {
      const code = getApiErrorCode(error);
      if (code === 'TEST_CONFIGURATION_ERROR' || code === 'TEST_NOT_AVAILABLE') {
        setScreen('unavailable');
        return;
      }
      toast.error(getApiErrorMessage(error, 'Unable to start this test'));
    }
  };

  const moveToPage = async (nextPageIndex: number) => {
    try {
      await flushPendingAnswers();
      setPageIndex(nextPageIndex);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast.error('Save the pending answer before changing pages.');
    }
  };

  const openReview = async () => {
    try {
      await flushPendingAnswers();
      setScreen('review');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      toast.error('Save the pending answer before reviewing your test.');
    }
  };

  const gradeTranslation = async (event: TestTranslationGradeEvent): Promise<TestTranslationGradeFeedback> => {
    if (!attempt || !user) throw new Error('This test attempt is not available.');
    const requestedOriginKey = originKey;
    try {
      await flushPendingAnswers();
      const response = await gradeTestTranslation({
        uid: user.uid,
        attemptId: attempt.id,
        ...event,
      }).unwrap();
      if (activeOriginKeyRef.current !== requestedOriginKey) {
        throw new Error('The active test changed while the translation was being graded.');
      }
      const savedAnswer = response.attempt.answers[event.exerciseId];
      if (savedAnswer) adoptPersistedAnswer({ exerciseId: event.exerciseId, answer: savedAnswer });
      setAttempt(response.attempt);
      return { score: response.grade.score, feedback: response.grade.feedback };
    } catch (error) {
      throw new Error(getApiErrorMessage(error, 'Unable to grade this translation'));
    }
  };

  const submit = async () => {
    if (!attempt || !user) return;
    const requestedOriginKey = originKey;
    try {
      await flushPendingAnswers();
      const response = await submitAttempt({
        uid: user.uid,
        attemptId: attempt.id,
      }).unwrap();
      if (activeOriginKeyRef.current !== requestedOriginKey) return;
      setResult(response.attempt);
      setScreen('results');
      if (isMockTest) {
        setMockRetakeAvailability('checking');
        // A completed delivery remains viewable even if administrators hide,
        // archive, or move its mock before this refresh finishes. Retakes,
        // however, must be based on fresh live projections rather than the
        // detail that authorized the just-submitted frozen attempt.
        void Promise.allSettled([refetchDashboard(), refetchMockDetail()]).then(results => {
          if (activeOriginKeyRef.current !== requestedOriginKey) return;
          const refreshedDashboard = results[0].status === 'fulfilled' ? results[0].value.data : undefined;
          const refreshedDetail = results[1].status === 'fulfilled' ? results[1].value.data : undefined;
          const liveCard = refreshedDashboard?.mockTests?.find(mock => mock.id === testId);
          const isEligible = Boolean(
            liveCard && refreshedDetail?.mock.status === 'active' && refreshedDetail.mock.isLive
          );
          setMockRetakeAvailability(isEligible ? 'available' : 'unavailable');
        });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (getApiErrorCode(error) === 'TEST_CONFIGURATION_ERROR') {
        setScreen('unavailable');
        return;
      }
      toast.error(getApiErrorMessage(error, 'Unable to submit this test'));
    }
  };

  if (authLoading || dashboardLoading || (isMockTest && mockDetailLoading) || (!user && !dashboardError)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble">
        <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-roman-red" />
      </div>
    );
  }

  // A submit can legitimately make a hidden/archived/moved mock detail 404.
  // The submitted response is already authorized and self-contained, so never
  // replace its result screen with that expected post-submit refetch error.
  if ((dashboardError || (isMockTest && mockDetailError)) && !(screen === 'results' && result)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble p-6">
        <Card className="max-w-lg">
          <CardContent className="space-y-4 p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
            <h1 className="font-serif text-2xl">Unable to load this test</h1>
            <p className="text-gray-600">This test could not be loaded. Please try again.</p>
            <Button
              type="button"
              onClick={() => {
                void refetchDashboard();
                if (isMockTest) void refetchMockDetail();
              }}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!test || (isMockTest && !mockTest && !mockDetail?.attempt)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble p-6">
        <Card className="max-w-lg">
          <CardContent className="space-y-4 p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
            <h1 className="font-serif text-2xl">Test unavailable</h1>
            <p className="text-gray-600">This test is not currently available.</p>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isMockTest && normalTest?.status === 'locked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble p-6">
        <Card className="max-w-lg border-gray-300">
          <CardContent className="space-y-4 p-8 text-center">
            <FileCheck2 className="mx-auto h-10 w-10 text-gray-500" />
            <h1 className="font-serif text-2xl">{test.title}</h1>
            <p className="text-gray-600">
              {normalTest.lockedReason || 'Complete the previous learning unit to unlock this test.'}
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (screen === 'unavailable' || (!isMockTest && normalTest?.configurationStatus === 'unavailable')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble p-6">
        <Card className="max-w-lg border-amber-200">
          <CardContent className="space-y-4 p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
            <h1 className="font-serif text-2xl">This test is temporarily unavailable</h1>
            <p className="text-gray-600">
              Your work has not been submitted. Please return later or ask an administrator to review the test
              configuration.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (screen === 'expectations') {
    const points = mockTest
      ? `${formatPoints(mockTest.totalPoints)} total points`
      : normalTest && normalTest.minTotalPoints === normalTest.maxTotalPoints
        ? `${formatPoints(normalTest.minTotalPoints)} total points`
        : `${formatPoints(normalTest?.minTotalPoints ?? 0)}–${formatPoints(normalTest?.maxTotalPoints ?? 0)} total points, depending on the version selected`;
    return (
      <div className="min-h-screen bg-gradient-to-br from-roman-marble via-white to-roman-parchment p-4 md:p-10">
        <Card className="mx-auto max-w-2xl overflow-hidden border-roman-red/20 shadow-xl">
          <div className="h-1.5 bg-roman-red" />
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 rounded-full border-2 border-roman-gold/40 bg-roman-red p-3 text-white shadow-sm">
              <FileCheck2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <CardTitle className="font-serif text-3xl text-roman-red">{test.title}</CardTitle>
            <p className="text-roman-stone">{test.description}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border border-roman-gold/30 bg-roman-parchment/60 p-4">
              <div className="font-semibold text-roman-red">
                {test.passingPercentage === null
                  ? isMockTest
                    ? 'Score only — this mock is practice and never gates your Learning Path'
                    : 'Score only — this test cannot be failed'
                  : isMockTest
                    ? `Practice target: ${test.passingPercentage}% — informational only`
                    : `Passing requirement: ${test.passingPercentage}%`}
              </div>
              <div className="mt-1 text-sm text-roman-stone">{points}</div>
            </div>
            <ul className="space-y-3 text-sm text-gray-700">
              <li>Translation exercises show brief AI feedback when you check each answer.</li>
              <li>Feedback for other exercise types is withheld until you submit.</li>
              <li>Your committed answers are saved and can be resumed after a refresh.</li>
              <li>This test is untimed. Review your answers before submitting.</li>
            </ul>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="outline" className="sm:flex-1">
                <Link href="/dashboard">Not now</Link>
              </Button>
              <Button
                className="bg-roman-red hover:bg-roman-red/90 sm:flex-1"
                disabled={starting || (isMockTest && !mockTest)}
                onClick={begin}>
                {starting
                  ? 'Preparing test…'
                  : attemptSummary?.inProgressAttemptId
                    ? isMockTest
                      ? 'Continue Mock Test'
                      : 'Continue Test'
                    : (attemptSummary?.attemptCount ?? 0) > 0
                      ? isMockTest
                        ? 'Start Mock Retake'
                        : 'Start Retake'
                      : isMockTest
                        ? 'Start Mock Test'
                        : 'Start Test'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (screen === 'results' && result) {
    const shortfall =
      result.passingPercentage !== null && result.outcome === 'not-passed'
        ? Math.max(0, result.passingPercentage - result.percentage)
        : 0;
    return (
      <div className="min-h-screen bg-roman-marble p-4 md:p-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <Card
            className={
              result.outcome === 'not-passed'
                ? 'overflow-hidden border-amber-300'
                : 'overflow-hidden border-emerald-300'
            }>
            <div className="h-1.5 bg-roman-red" />
            <CardContent className="space-y-4 p-8 text-center">
              {result.outcome === 'not-passed' ? (
                <AlertTriangle className="mx-auto h-12 w-12 text-amber-600" />
              ) : (
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              )}
              <h1 className="font-serif text-3xl">
                {result.outcome === 'passed'
                  ? 'Test passed'
                  : result.outcome === 'score-only'
                    ? isMockTest
                      ? 'Mock test complete'
                      : 'Test complete'
                    : 'Keep going'}
              </h1>
              <div className="text-5xl font-semibold text-roman-red">{Math.round(result.percentage)}%</div>
              <p className="text-lg">
                {formatPoints(result.score)} / {formatPoints(result.maxScore)} points
              </p>
              {result.outcome === 'not-passed' && result.passingPercentage !== null && (
                <div className="rounded-lg bg-amber-50 p-3 text-amber-950">
                  You need {result.passingPercentage}% — you reached {Math.round(result.percentage)}%. You are{' '}
                  {shortfall.toFixed(1).replace(/\.0$/, '')} percentage points away.
                </div>
              )}
              {!isMockTest && result.outcome === 'not-passed' && normalTest?.relatedLiveMocks?.[0] && (
                <Link
                  className="inline-block text-sm font-semibold text-teal-800 underline underline-offset-2"
                  href={`/test/${encodeURIComponent(normalTest.relatedLiveMocks[0].id)}?origin=mock`}>
                  Practice with the {normalTest.relatedLiveMocks[0].title} Mock Test before retaking.
                </Link>
              )}
              {isMockTest && (
                <p className="text-sm text-teal-800">
                  This result is for practice only and does not change your Learning Path.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Results breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(result.exerciseResults).map(([exerciseId, exerciseResult], index) => (
                <div key={exerciseId} className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
                  <span>
                    {index + 1}. {exerciseResult.title || 'Exercise'}
                  </span>
                  <strong>
                    {formatPoints(exerciseResult.awardedPoints)} / {formatPoints(exerciseResult.maxPoints)}
                  </strong>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            {isMockTest && mockRetakeAvailability !== 'available' ? (
              <p className="self-center text-sm text-gray-600">
                {mockRetakeAvailability === 'checking'
                  ? 'Checking whether this mock is still available for another attempt…'
                  : 'This mock test is no longer available for another attempt.'}
              </p>
            ) : (
              <Button
                className="bg-roman-red hover:bg-roman-red/90"
                onClick={() => {
                  setAttempt(null);
                  setResult(null);
                  resetAnswerBuffer();
                  setPageIndex(0);
                  setScreen('expectations');
                }}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                {isMockTest ? 'Retake Mock Test' : 'Retake Test'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!attempt) return null;

  if (screen === 'review') {
    const unanswered = exerciseItems.filter(
      item => !isExerciseAnswerComplete(item.exercise, answers[item.id], item.resolvedItemCount)
    );
    return (
      <div className="min-h-screen bg-roman-marble p-4 md:p-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <Card className="overflow-hidden border-roman-red/15">
            <div className="h-1.5 bg-roman-red" />
            <CardHeader>
              <CardTitle className="font-serif text-2xl text-roman-red">Review before submitting</CardTitle>
              <p className="text-sm text-roman-stone">
                {answeredCount} of {exerciseItems.length} exercises answered
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {unanswered.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                  Every exercise has a recorded answer.
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="font-medium text-amber-950">
                    {unanswered.length} unanswered {unanswered.length === 1 ? 'exercise' : 'exercises'}
                  </p>
                  <ul className="mt-2 list-inside list-disc text-sm text-amber-900">
                    {unanswered.map(item => (
                      <li key={item.id}>
                        Page {item.pageIndex + 1}: {item.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm text-gray-600">
                Submission is final for this attempt. Exact questions and answers cannot be reopened afterward, but your
                score breakdown will be retained.
              </p>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => setScreen('taking')}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Return to test
            </Button>
            <Button
              className="bg-roman-red hover:bg-roman-red/90"
              disabled={submitting || translationGrading}
              onClick={submit}>
              {submitting ? 'Submitting…' : 'Submit Test'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const saveStatus = translationGrading ? (
    <span>Grading and saving translation…</span>
  ) : saveError ? (
    <span className="font-medium text-red-700">{saveError}</span>
  ) : answerSaveStatus === 'recorded' ? (
    <span>Answer recorded. Saving…</span>
  ) : answerSaveStatus === 'saving' ? (
    <span>Saving answer…</span>
  ) : answerSaveStatus === 'saved' ? (
    <span>Answer saved.</span>
  ) : (
    <span>Answer save needs your attention.</span>
  );

  return (
    <TestTranslationGradingProvider value={{ grades: attempt.translationGrades, grade: gradeTranslation }}>
      <TestTakingView
        title={test.title}
        description={test.description}
        pages={attempt.delivery.pages}
        currentPageIndex={pageIndex}
        answeredCount={answeredCount}
        totalExercises={exerciseItems.length}
        status={saveStatus}
        answers={answers}
        resolvedExerciseState={attempt.delivery.resolvedExercises}
        resolvedVocabularyPool={attempt.delivery.vocabularyPool}
        onAnswer={recordAnswer}
        onPrevious={() => void moveToPage(pageIndex - 1)}
        onNext={() => void moveToPage(pageIndex + 1)}
        onReview={() => void openReview()}
        navigationPending={translationGrading}
      />
    </TestTranslationGradingProvider>
  );
}
