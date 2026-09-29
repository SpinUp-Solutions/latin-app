'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';
import { PageLoading } from '@/src/components/ui/page-loading';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { RomanPlayerShell } from '@/src/components/ui/core/roman-player-shell';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { SectionedTestPlayer } from '@/src/components/ui/test/sectioned-test-player';
import { useAuth } from '@/src/hooks/useAuth';
import { useBufferedAttemptAnswers } from '@/src/hooks/useBufferedAttemptAnswers';
import { formatScorePercentage, formatScorePoints, formatScoreShortfall } from '@/src/lib/tests/formatting';
import { getApiErrorCode, getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useGetStudentDashboardQuery } from '@/src/store/api/lessonApi';
import { useGetStudentMockDetailQuery } from '@/src/store/api/mockTestApi';
import { useStartTestAttemptMutation } from '@/src/store/api/testApi';
import type { StudentTestSummary } from '@/src/types/lesson';
import type { TestAttemptOrigin } from '@/src/types/test';
import type { StudentInProgressTestAttempt, StudentSubmittedTestAttempt } from '@/src/types/test';

const TEST_HISTORY_GUARD_KEY = '__latinTestHistoryGuard';

type Screen = 'expectations' | 'taking' | 'results' | 'unavailable';
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
  const answerBuffer = useBufferedAttemptAnswers();
  const { activateAttempt, flushPendingAnswers, hasUnsavedAnswers, reset: resetAnswerBuffer } = answerBuffer;

  const [screen, setScreen] = useState<Screen>('expectations');
  const [attempt, setAttempt] = useState<StudentInProgressTestAttempt | null>(null);
  const [result, setResult] = useState<StudentSubmittedTestAttempt | null>(null);
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
          section: response.attempt.section,
          attemptId: response.attempt.id,
          originKey,
        });
        setAttempt(response.attempt);
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

  useEffect(() => {
    if (screen !== 'taking') return;
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
  }, [flushPendingAnswers, hasUnsavedAnswers, originKey, screen]);

  const startFreshAttempt = async () => {
    if (!user || !test || (isMockTest && !mockTest) || normalTest?.status === 'locked') return;
    const requestedOriginKey = originKey;
    try {
      const response = await startAttempt({ uid: user.uid, origin }).unwrap();
      if (activeOriginKeyRef.current !== requestedOriginKey) return;
      activateAttempt({
        answers: response.attempt.answers,
        section: response.attempt.section,
        attemptId: response.attempt.id,
        originKey: requestedOriginKey,
      });
      setAttempt(response.attempt);
      setScreen('taking');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const code = getApiErrorCode(error);
      if (code === 'TEST_CONFIGURATION_ERROR' || code === 'TEST_NOT_AVAILABLE') {
        setScreen('unavailable');
        return;
      }
      toast.error(getApiErrorMessage(error, 'Unable to start this test'));
    }
  };

  const begin = async () => {
    if (!user || !test || (isMockTest && !mockTest) || normalTest?.status === 'locked') return;
    if (attempt) {
      setScreen('taking');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await startFreshAttempt();
  };

  const retake = () => {
    setAttempt(null);
    setResult(null);
    resetAnswerBuffer();
    void startFreshAttempt();
  };

  const exitTest = async () => {
    try {
      await flushPendingAnswers();
      router.push('/dashboard');
    } catch {
      toast.error('Save the pending answer before leaving this test.');
    }
  };

  const acceptSubmission = (submittedResult: StudentSubmittedTestAttempt) => {
    const requestedOriginKey = originKey;
    setResult(submittedResult);
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
  };

  if (authLoading || dashboardLoading || (isMockTest && mockDetailLoading) || (!user && !dashboardError)) {
    return <PageLoading label="Loading test" />;
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
            <h1 className="font-serif text-2xl">
              <SimpleRichDisplay content={test.title} />
            </h1>
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
      ? `${formatScorePoints(mockTest.totalPoints)} total points`
      : normalTest && normalTest.minTotalPoints === normalTest.maxTotalPoints
        ? `${formatScorePoints(normalTest.minTotalPoints)} total points`
        : `${formatScorePoints(normalTest?.minTotalPoints ?? 0)}–${formatScorePoints(normalTest?.maxTotalPoints ?? 0)} total points, depending on the version selected`;
    const mockAction = attempt
      ? mockDetail?.attempt || attemptSummary?.inProgressAttemptId
        ? 'Continue Mock Test'
        : (attemptSummary?.attemptCount ?? 0) > 0
          ? 'Begin Mock Retake'
          : 'Begin Mock Test'
      : attemptSummary?.inProgressAttemptId
        ? 'Continue Mock Test'
        : (attemptSummary?.attemptCount ?? 0) > 0
          ? 'Start Mock Retake'
          : 'Start Mock Test';
    return (
      <div className="min-h-screen bg-gradient-to-b from-roman-marble via-white to-roman-parchment/60 p-4 sm:p-6 md:p-10">
        <Card className="mx-auto max-w-3xl overflow-hidden rounded-2xl border-roman-red/15 shadow-lg">
          <div className="h-1.5 bg-roman-red" />
          <CardHeader className="px-6 pb-5 pt-7 text-center sm:px-8">
            <div className="mx-auto mb-2 rounded-full border-2 border-roman-gold/40 bg-roman-red p-3 text-white shadow-sm">
              <FileCheck2 className="h-7 w-7" aria-hidden="true" />
            </div>
            <CardTitle className="font-serif text-3xl text-roman-red">
              <SimpleRichDisplay content={test.title} />
            </CardTitle>
            <div className="text-roman-stone">
              <SimpleRichDisplay content={test.description} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-6 pb-7 sm:px-8">
            <div className="rounded-xl border border-roman-gold/25 bg-roman-parchment/50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
              <div className="font-semibold text-roman-red">
                {test.passingPercentage === null
                  ? isMockTest
                    ? 'Practice only — your score will not affect your Learning Path'
                    : 'Complete this test to continue — any score counts'
                  : isMockTest
                    ? `Aim for ${test.passingPercentage}% — this is practice and will not affect your Learning Path`
                    : `Score ${test.passingPercentage}% or higher to continue along your Learning Path`}
              </div>
              <div className="mt-1 shrink-0 text-sm text-roman-stone sm:mt-0">{points} · Untimed</div>
            </div>
            <ul className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-700">
              <li className="flex gap-3 before:mt-2.5 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-roman-red">
                Review each section before confirming it. Once confirmed, you cannot return. All scores and feedback
                appear after submission.
              </li>
              <li className="flex gap-3 before:mt-2.5 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-roman-red">
                Your answers save automatically, so you can refresh or return later without losing your work.
              </li>
              <li className="flex gap-3 before:mt-2.5 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-roman-red">
                Review your answers before submitting.
              </li>
            </ul>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="outline" className="h-11 rounded-xl sm:flex-1">
                <Link href="/dashboard">Not now</Link>
              </Button>
              <Button
                className="h-11 rounded-xl bg-roman-red hover:bg-roman-red/90 sm:flex-1"
                disabled={starting || (isMockTest && !mockTest)}
                onClick={begin}>
                {starting
                  ? 'Preparing test…'
                  : isMockTest
                    ? mockAction
                    : attemptSummary?.inProgressAttemptId
                      ? 'Continue Test'
                      : (attemptSummary?.attemptCount ?? 0) > 0
                        ? 'Start Retake'
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
    const resultTitle =
      result.outcome === 'passed'
        ? 'Test passed'
        : result.outcome === 'score-only'
          ? isMockTest
            ? 'Mock test complete'
            : 'Test complete'
          : 'Keep going';
    return (
      <div className="min-h-screen bg-roman-marble p-4 md:p-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <RomanPlayerShell
            icon={result.outcome === 'not-passed' ? AlertTriangle : CheckCircle2}
            label="Results"
            title={resultTitle}
            headingAs="h1"
            className={
              result.outcome === 'not-passed'
                ? 'overflow-hidden rounded-2xl border-amber-300 shadow-md'
                : 'overflow-hidden rounded-2xl border-emerald-300 shadow-md'
            }
            contentClassName="space-y-4 p-8 text-center">
            <div className="text-5xl font-semibold text-roman-red">{formatScorePercentage(result.percentage)}%</div>
            <p className="text-lg">
              {formatScorePoints(result.score)} / {formatScorePoints(result.maxScore)} points
            </p>
            {result.outcome === 'not-passed' && result.passingPercentage !== null && (
              <div className="rounded-lg bg-amber-50 p-3 text-amber-950">
                You need {result.passingPercentage}% — you reached {formatScorePercentage(result.percentage)}%. You are{' '}
                {formatScoreShortfall(shortfall)} percentage points away.
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
          </RomanPlayerShell>

          <Card>
            <CardHeader>
              <CardTitle>Results breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(result.exerciseResults).map(([exerciseId, exerciseResult], index) => (
                <div key={exerciseId} className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="shrink-0">{index + 1}.</span>
                    <SimpleRichDisplay content={exerciseResult.title || 'Exercise'} />
                  </span>
                  <strong>
                    {formatScorePoints(exerciseResult.awardedPoints)} / {formatScorePoints(exerciseResult.maxPoints)}
                  </strong>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/test-results/${result.id}`}>Review answers</Link>
            </Button>
            {isMockTest && mockRetakeAvailability !== 'available' ? (
              mockRetakeAvailability === 'checking' ? (
                <div
                  className="flex self-center items-center justify-center text-roman-red"
                  role="status"
                  aria-label="Loading retake options">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                </div>
              ) : (
                <p className="self-center text-sm text-gray-600">
                  This mock test is no longer available for another attempt.
                </p>
              )
            ) : (
              <Button className="bg-roman-red hover:bg-roman-red/90" onClick={() => void retake()}>
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

  return (
    <SectionedTestPlayer
      key={attempt.id}
      attempt={attempt}
      onAttempt={setAttempt}
      buffer={answerBuffer}
      title={test.title}
      uid={user!.uid}
      originKey={originKey}
      onSubmitted={acceptSubmission}
      onExit={exitTest}
    />
  );
}
