'use client';

import React, { memo, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/services/firebase';
import { useGetStudentDashboardQuery } from '@/src/store/api/lessonApi';
import { useAuth } from '@/src/hooks/useAuth';
import {
  LessonStatus,
  StudentLessonSummary,
  type StudentLearningUnitSummary,
  type StudentTestSummary,
} from '@/src/types/lesson';
import { Button } from '@/src/components/ui/button';
import { toast } from 'sonner';
import { BookOpen, User } from 'lucide-react';
import Image from 'next/image';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { CircularProgressButton } from '@/src/components/ui/CircularProgressButton';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { SwiperNavigation } from '@/src/components/ui/core/swiper-nav';
import { PracticeSection } from '@/src/components/ui/core/PracticeSection';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { FeedbackBanner } from '@/src/components/ui/core/feedback-banner';
export { MockTestCard } from '@/src/components/ui/core/mock-test-card';

const statusConfig: Record<LessonStatus, { card: string }> = {
  completed: {
    card: 'bg-gradient-to-br from-roman-green/15 via-roman-green/10 to-emerald-100/5 border border-roman-green/20 backdrop-blur-sm',
  },
  available: {
    card: 'bg-gradient-to-br from-roman-stone/10 via-roman-stone/5 to-roman-marble/20 border border-roman-stone/20 backdrop-blur-sm',
  },
  'in-progress': {
    card: 'bg-gradient-to-br from-roman-terracotta/15 via-roman-red/10 to-roman-terracotta/5 border border-roman-terracotta/20 backdrop-blur-sm',
  },
  locked: {
    card: 'bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 border border-gray-300/50 backdrop-blur-sm',
  },
};

const LessonCard = memo(
  ({ lesson, onLessonClick }: { lesson: StudentLessonSummary; onLessonClick: (id: string) => void }) => {
    const config = statusConfig[lesson.status || 'available'] || statusConfig.available;

    const handleClick = () => {
      if (lesson.status === 'locked') {
        toast.error('Complete the previous lesson to unlock this one');
        return;
      }
      onLessonClick(lesson.id);
    };

    return (
      <RomanCard
        className={`group h-36 cursor-pointer rounded-3xl shadow-xl transition-all duration-300 transform hover:-translate-y-2 hover:scale-[1.02] hover:shadow-2xl ${config.card}`}
        onClick={handleClick}>
        <RomanCardContent className="relative p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex-1 pr-4 min-w-0">
              <h3 className="text-xl font-serif mb-2 text-gray-900 truncate">{lesson.title}</h3>
              <div className="text-sm text-roman-stone line-clamp-2">
                <SimpleRichDisplay content={lesson.description || ''} />
              </div>
            </div>
            <div className="flex-shrink-0">
              <CircularProgressButton
                progress={typeof lesson.progress === 'number' ? lesson.progress : 0}
                status={lesson.status}
                onClick={(e?: React.MouseEvent) => {
                  e?.stopPropagation();
                  handleClick();
                }}
              />
            </div>
          </div>
        </RomanCardContent>
      </RomanCard>
    );
  }
);

LessonCard.displayName = 'LessonCard';

export const TestCard = memo(
  ({ test, onTestClick }: { test: StudentTestSummary; onTestClick: (id: string) => void }) => {
    const summary = test.attemptSummary;
    const unavailable = test.configurationStatus === 'unavailable';
    const action = summary.inProgressAttemptId
      ? 'Continue Test'
      : summary.attemptCount > 0
        ? 'Retake Test'
        : 'Start Test';
    const locked = test.status === 'locked';
    const progress = test.status === 'completed' ? 100 : summary.inProgressAttemptId ? 50 : 0;
    const latestOutcome =
      summary.latest?.outcome === 'not-passed'
        ? test.status === 'completed'
          ? 'Latest: Not passed · completion retained'
          : 'Latest: Not passed'
        : summary.latest?.outcome === 'passed'
          ? 'Latest: Passed'
          : summary.latest?.outcome === 'score-only'
            ? 'Latest: Completed'
            : null;

    const handleClick = () => {
      if (unavailable) {
        toast.error('This test is temporarily unavailable. Please try again later.');
        return;
      }
      if (locked) {
        toast.error(test.lockedReason || 'Complete the previous learning unit to unlock');
        return;
      }
      onTestClick(test.id);
    };

    return (
      <RomanCard
        data-testid="dashboard-test-card"
        className={`group h-36 cursor-pointer rounded-3xl border shadow-xl transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02] hover:shadow-2xl ${
          locked
            ? 'border-gray-300 bg-gradient-to-br from-gray-100 to-gray-50'
            : test.passingPercentage === null
              ? 'border-sky-300 bg-gradient-to-br from-sky-50 via-indigo-50 to-white'
              : 'border-indigo-300 bg-gradient-to-br from-indigo-100/90 via-violet-50 to-white'
        }`}
        onClick={handleClick}>
        <RomanCardContent className="relative h-full p-6">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/20 to-transparent" />
          <div className="relative flex h-full items-center justify-between">
            <div className="min-w-0 flex-1 pr-4">
              <h3 className="truncate font-serif text-xl text-gray-950">{test.title}</h3>
              <div className="mt-1 line-clamp-1 text-sm text-gray-600">
                <SimpleRichDisplay content={test.description || ''} />
              </div>
              <div className="mt-2 flex min-w-0 items-center gap-2 text-xs font-semibold text-indigo-800">
                {locked ? (
                  <span className="truncate">
                    {test.lockedReason || 'Complete the previous learning unit to unlock'}
                  </span>
                ) : (
                  <>
                    {latestOutcome ? (
                      <span
                        className={`shrink-0 ${summary.latest?.outcome === 'not-passed' ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {latestOutcome}
                      </span>
                    ) : summary.inProgressAttemptId ? (
                      <span className="shrink-0 text-amber-700">In progress</span>
                    ) : (
                      <span className="truncate">
                        {test.passingPercentage === null
                          ? 'Score only · cannot fail'
                          : `Pass ≥ ${test.passingPercentage}%`}
                      </span>
                    )}
                    {summary.latest?.outcome === 'not-passed' && test.relatedLiveMocks?.[0] && (
                      <a
                        className="min-w-0 truncate text-teal-800 underline-offset-2 hover:underline"
                        href={`/test/${encodeURIComponent(test.relatedLiveMocks[0].id)}?origin=mock`}
                        onClick={event => event.stopPropagation()}>
                        Practice with the {test.relatedLiveMocks[0].title} Mock Test
                      </a>
                    )}
                  </>
                )}
              </div>
              {summary.latest ? (
                <div className="mt-1 flex min-w-0 items-center gap-1.5">
                  <a
                    data-testid="test-review-latest-link"
                    className="truncate text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline"
                    href={`/test-results/${summary.latest.attemptId}`}
                    onClick={event => event.stopPropagation()}>
                    Review latest result
                  </a>
                </div>
              ) : null}
            </div>
            <CircularProgressButton
              progress={progress}
              status={test.status}
              disabled={unavailable}
              ariaLabel={unavailable ? 'Test unavailable' : locked ? 'Test locked' : action}
              onClick={(event?: React.MouseEvent) => {
                event?.stopPropagation();
                handleClick();
              }}
            />
          </div>
        </RomanCardContent>
      </RomanCard>
    );
  }
);

TestCard.displayName = 'TestCard';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, displayName } = useAuth();

  const {
    data: studentDashboard,
    isLoading: lessonsLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useGetStudentDashboardQuery(user?.uid ?? '', {
    skip: !user?.uid,
  });

  const learningUnits = useMemo(() => {
    return studentDashboard?.learningPath ?? [];
  }, [studentDashboard]);

  const vocabLessons = useMemo(() => {
    return studentDashboard?.practiceLessons.filter(lesson => lesson.type === 'vocab') ?? [];
  }, [studentDashboard]);

  const diagrammingLessons = useMemo(() => {
    return studentDashboard?.practiceLessons.filter(lesson => lesson.type === 'sentence-diagramming') ?? [];
  }, [studentDashboard]);

  const listeningLessons = useMemo(() => {
    return studentDashboard?.practiceLessons.filter(lesson => lesson.type === 'listening') ?? [];
  }, [studentDashboard]);

  const practiceLessons = useMemo(
    () => [...vocabLessons, ...diagrammingLessons, ...listeningLessons],
    [vocabLessons, diagrammingLessons, listeningLessons]
  );
  const mockTests = useMemo(() => studentDashboard?.mockTests ?? [], [studentDashboard]);
  const pastMockResults = useMemo(() => studentDashboard?.pastMockResults ?? [], [studentDashboard]);

  const completionStats = useMemo(() => {
    if (learningUnits.length === 0) return { percentage: 0, completed: 0, total: 0 };
    const completed = learningUnits.filter(unit => unit.status === 'completed').length;
    const percentage = Math.round((completed / learningUnits.length) * 100);
    return { percentage, completed, total: learningUnits.length };
  }, [learningUnits]);

  const getInitialSlideIndex = useMemo(() => {
    if (learningUnits.length === 0) return 0;

    const inProgressIndex = learningUnits.findIndex(unit => unit.status === 'in-progress');
    if (inProgressIndex !== -1) return inProgressIndex;

    const availableIndex = learningUnits.findIndex(unit => unit.status === 'available');
    if (availableIndex !== -1) return availableIndex;

    return 0;
  }, [learningUnits]);

  const handleLessonClick = useCallback(
    (lessonId: string) => {
      const allUnits: StudentLearningUnitSummary[] = [
        ...learningUnits,
        ...vocabLessons,
        ...diagrammingLessons,
        ...listeningLessons,
      ];
      const unit = allUnits.find(candidate => candidate.id === lessonId);

      if (unit?.status === 'locked') {
        toast.error(unit.lockedReason || 'Complete the previous learning unit to unlock');
        return;
      }

      router.push(unit?.kind === 'test' ? `/test/${lessonId}` : `/lesson/${lessonId}`);
    },
    [router, learningUnits, vocabLessons, diagrammingLessons, listeningLessons]
  );

  const handleMockClick = useCallback(
    (mockTestId: string) => {
      router.push(`/test/${encodeURIComponent(mockTestId)}?origin=mock`);
    },
    [router]
  );

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/login');
      toast.success('Successfully logged out!');
    } catch {
      toast.error('Failed to log out. Please try again.');
    }
  };

  if (loading || !user || lessonsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble p-6">
        <RomanCard className="w-full max-w-lg">
          <RomanCardContent className="space-y-4 p-8 text-center">
            <h1 className="font-serif text-2xl text-gray-900">Unable to load your dashboard</h1>
            <p className="text-gray-600">Your Learning Path could not be loaded. Please try again.</p>
            <Button type="button" onClick={() => void refetchDashboard()}>
              Retry
            </Button>
          </RomanCardContent>
        </RomanCard>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-roman-marble via-white to-roman-parchment">
      <div className="absolute inset-0">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-gradient-to-r from-roman-red/30 to-roman-terracotta/20 rounded-full mix-blend-multiply filter blur-2xl opacity-80 animate-blob"></div>
        <div
          className="absolute top-0 -right-4 w-96 h-96 bg-gradient-to-l from-roman-gold/40 to-amber-300/30 rounded-full mix-blend-multiply filter blur-2xl opacity-80 animate-blob"
          style={{ animationDelay: '2s' }}></div>
        <div
          className="absolute -bottom-8 left-20 w-96 h-96 bg-gradient-to-t from-roman-green/25 to-emerald-300/20 rounded-full mix-blend-multiply filter blur-2xl opacity-80 animate-blob"
          style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative">
        <header className="bg-white/80 backdrop-blur-sm border-b border-roman-red/20 px-8 py-6 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-4">
            <Image
              src="/assets/logos/wakeforest_shield.png"
              alt="Wake Forest University"
              width={1000}
              height={736}
              className="h-14 w-auto"
              priority
            />
            <div>
              <h1 className="text-3xl font-serif tracking-wide text-gray-900 mb-1">Wake Forest University Latin</h1>
              <p className="text-lg text-roman-stone leading-relaxed">Welcome back, {displayName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              className="text-roman-stone hover:text-roman-red px-6 py-3 rounded-xl text-lg font-medium flex items-center hover:bg-roman-red/5 transition-all"
              onClick={() => router.push('/profile')}>
              <User className="h-5 w-5 mr-2" />
              Profile
            </Button>
            <Button
              onClick={handleSignOut}
              size="lg"
              className="bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 hover:scale-105">
              Sign Out
            </Button>
          </div>
        </header>

        <FeedbackBanner />

        <main className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
          <div className="max-w-[1800px] mx-auto">
            {/* Available Lessons - Full Width Priority */}
            <section className="mb-16">
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-6xl font-serif text-gray-900 mb-4 leading-tight">Your Learning Path</h2>
                  <p className="text-2xl text-roman-stone leading-relaxed">
                    Continue your journey through Latin mastery
                  </p>
                </div>
                {learningUnits.length > 0 && (
                  <div className="text-right">
                    <div className="text-4xl font-serif text-transparent bg-clip-text bg-gradient-to-r from-roman-red to-roman-terracotta mb-2">
                      {completionStats.percentage}% Complete
                    </div>
                    <div className="text-lg text-roman-stone leading-relaxed">
                      {completionStats.completed} of {completionStats.total} learning units finished
                    </div>
                  </div>
                )}
              </div>

              {learningUnits.length === 0 ? (
                <RomanCard>
                  <RomanCardContent className="p-12 text-center">
                    <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-2xl font-serif text-gray-700 mb-2">No Learning Units Available</h3>
                    <p className="text-gray-500">
                      Check back soon! Your instructors are preparing amazing Latin lessons for you.
                    </p>
                  </RomanCardContent>
                </RomanCard>
              ) : (
                <div className="relative ">
                  <Swiper
                    spaceBetween={0}
                    slidesPerView={1}
                    initialSlide={getInitialSlideIndex}
                    speed={250}
                    threshold={5}
                    grabCursor
                    breakpoints={{
                      1024: { slidesPerView: 2 },
                      1280: { slidesPerView: 3 },
                    }}
                    className="lesson-cards-carousel overflow-visible px-0 py-8 sm:p-8"
                    centeredSlides={true}
                    effect="slide">
                    <div slot="container-end">
                      <SwiperNavigation />
                    </div>

                    {learningUnits.map(unit => (
                      <SwiperSlide
                        key={unit.id}
                        className="overflow-visible px-2 py-8 transition-transform duration-300 sm:p-6 lg:p-10">
                        {({ isActive }) => (
                          <div
                            className={`transform-gpu transition-transform duration-300 ${
                              isActive ? 'scale-100 sm:scale-110 xl:scale-125' : 'scale-95'
                            }`}>
                            {unit.kind === 'test' ? (
                              <TestCard test={unit} onTestClick={handleLessonClick} />
                            ) : (
                              <LessonCard lesson={unit} onLessonClick={handleLessonClick} />
                            )}
                          </div>
                        )}
                      </SwiperSlide>
                    ))}
                  </Swiper>
                </div>
              )}
            </section>

            <section className="mb-16">
              <PracticeSection
                lessons={practiceLessons}
                onLessonClick={handleLessonClick}
                mockTests={mockTests}
                onMockTestClick={handleMockClick}
                pastMockResults={pastMockResults}
              />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
