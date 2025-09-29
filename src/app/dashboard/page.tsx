'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/services/firebase';
import type { RootState } from '@/src/store';
import { useGetStudentLessonsQuery } from '@/src/store/api/lessonApi';
import { LessonStatus, LessonWithProgress } from '@/src/types/lesson';
import { Button } from '@/src/components/ui/button';
import { toast } from 'sonner';
import React, { memo } from 'react';
import { BookOpen, User, Clock, Target, TrendingUp, CheckCircle } from 'lucide-react';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { CircularProgressButton } from '@/src/components/ui/CircularProgressButton';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/navigation';
import { SwiperNavigation } from '@/src/components/ui/core/swiper-nav';
import { VocabularyPracticeWidget } from '@/src/components/ui/core/VocabularyPracticeWidget';

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
  ({
    lesson,
    onLessonClick,
  }: {
    lesson: LessonWithProgress & { totalPages: number };
    onLessonClick: (id: string) => void;
  }) => {
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
        className={`group transition-all duration-300 cursor-pointer transform hover:-translate-y-2 hover:scale-[1.02] rounded-3xl shadow-xl hover:shadow-2xl ${config.card}`}
        onClick={handleClick}>
        <RomanCardContent className="relative p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl"></div>
          <div className="relative flex items-center justify-between">
            <div className="flex-1 pr-4">
              <h3 className="text-xl font-serif mb-2 text-gray-900">{lesson.title}</h3>
              <p className="text-sm text-roman-stone">{lesson.description}</p>
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

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useSelector((state: RootState) => state.auth);

  const { data: studentLessons, isLoading: lessonsLoading } = useGetStudentLessonsQuery(undefined, {
    skip: !user?.uid,
  });

  const lessons = useMemo(() => {
    if (!studentLessons) return [];

    return studentLessons.map(lesson => ({
      ...lesson,
      totalPages: lesson.pages.length,
    }));
  }, [studentLessons]);

  const todaysGoals = useMemo(
    () => [
      { task: 'Complete current lesson', completed: false, points: 50 },
      { task: 'Review 15 vocabulary words', completed: true, points: 30 },
      { task: 'Practice pronunciation', completed: false, points: 20 },
    ],
    []
  );

  const completionStats = useMemo(() => {
    if (lessons.length === 0) return { percentage: 0, completed: 0, total: 0 };
    const completed = lessons.filter(l => l.status === 'completed').length;
    const percentage = Math.round((completed / lessons.length) * 100);
    return { percentage, completed, total: lessons.length };
  }, [lessons]);

  const weeklyStats = useMemo(
    () => [
      { label: 'Lessons Completed', value: 2, icon: CheckCircle, color: 'roman-green' },
      { label: 'Words Learned', value: 89, icon: BookOpen, color: 'roman-red' },
      { label: 'Study Time', value: '4.2h', icon: Clock, color: 'roman-gold' },
      { label: 'Current Streak', value: '7 days', icon: TrendingUp, color: 'roman-terracotta' },
    ],
    []
  );

  const getInitialSlideIndex = useMemo(() => {
    if (lessons.length === 0) return 0;

    const inProgressIndex = lessons.findIndex(lesson => lesson.status === 'in-progress');
    if (inProgressIndex !== -1) return inProgressIndex;

    const availableIndex = lessons.findIndex(lesson => lesson.status === 'available');
    if (availableIndex !== -1) return availableIndex;

    return 0;
  }, [lessons]);

  const vocabularyLessons = useMemo(() => {
    return lessons.filter(lesson => lesson.status === 'completed' || lesson.status === 'in-progress');
  }, [lessons]);

  const handleLessonClick = useCallback(
    (lessonId: string) => {
      const lesson = lessons.find(l => l.id === lessonId);

      if (lesson?.status === 'locked') {
        toast.error('Complete the previous lesson to unlock this one');
        return;
      }

      router.push(`/lesson/${lessonId}`);
    },
    [router, lessons]
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

  const handleResetProgress = async () => {
    if (!user?.uid) return;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('User not authenticated');
        return;
      }

      const token = await currentUser.getIdToken();
      const response = await fetch('/api/dev/reset-progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      const data = await response.json();

      if (response.ok) {
        window.location.reload();
        toast.success(`Progress reset successfully! Deleted ${data.deletedCount || 0} records`);
      } else {
        toast.error(`Reset failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Reset progress error:', error);
      toast.error('Failed to reset progress');
    }
  };

  if (loading || !user || lessonsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
            <span className="text-xl">L</span>
          </div>
          <div>
            <h1 className="text-2xl font-serif tracking-wide">Latin Learning</h1>
            <p className="text-sm text-roman-stone">Welcome back, {user.displayName || user.email?.split('@')[0]}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            className="text-roman-stone hover:text-foreground/80 px-4 py-2 rounded-md text-sm font-medium flex items-center"
            onClick={() => router.push('/profile')}>
            <User className="h-5 w-5 mr-2" />
            Profile
          </Button>
          <Button variant="destructive" size="sm" onClick={handleResetProgress}>
            Reset Progress
          </Button>
          <Button onClick={handleSignOut}>Sign Out</Button>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-[1800px] mx-auto">
          {/* Available Lessons - Full Width Priority */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-4xl font-serif text-gray-900 mb-2">Your Learning Path</h2>
                <p className="text-lg text-roman-stone">Continue your journey through Latin mastery</p>
              </div>
              {lessons.length > 0 && (
                <div className="text-right">
                  <div className="text-2xl font-serif text-roman-red">{completionStats.percentage}% Complete</div>
                  <div className="text-sm text-roman-stone">
                    {completionStats.completed} of {completionStats.total} lessons finished
                  </div>
                </div>
              )}
            </div>

            {lessons.length === 0 ? (
              <RomanCard>
                <RomanCardContent className="p-12 text-center">
                  <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-2xl font-serif text-gray-700 mb-2">No Lessons Available</h3>
                  <p className="text-gray-500">
                    Check back soon! Your instructors are preparing amazing Latin lessons for you.
                  </p>
                </RomanCardContent>
              </RomanCard>
            ) : (
              <div className="relative ">
                <Swiper
                  modules={[]}
                  spaceBetween={0}
                  slidesPerView={1}
                  initialSlide={getInitialSlideIndex}
                  breakpoints={{
                    1024: { slidesPerView: 2 },
                    1280: { slidesPerView: 3 },
                  }}
                  className="lesson-cards-carousel overflow-visible p-8"
                  centeredSlides={true}
                  effect="slide">
                  <div>
                    <SwiperNavigation />
                  </div>

                  {lessons.map(lesson => (
                    <SwiperSlide key={lesson.id} className="overflow-visible p-10 transition-transform duration-500">
                      {({ isActive }) => (
                        <div
                          className={`transform transition-transform duration-300 ${isActive ? 'scale-125' : 'scale-95'}`}>
                          <LessonCard lesson={lesson} onLessonClick={handleLessonClick} />
                        </div>
                      )}
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>
            )}
          </section>

          {/* Vocabulary Practice Section */}
          <section className="mb-12">
            <VocabularyPracticeWidget lessons={vocabularyLessons} />
          </section>

          {/* Bottom Section - Goals and Stats */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Today's Goals */}
            <RomanCard>
              <RomanCardHeader>
                <h3 className="text-2xl font-serif flex items-center gap-3">
                  <Target className="h-6 w-6 text-roman-red" />
                  Today&apos;s Goals
                </h3>
                <p className="text-roman-stone mt-1">Complete your daily learning objectives</p>
              </RomanCardHeader>
              <RomanCardContent className="space-y-4">
                {todaysGoals.map((goal, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-roman-parchment/50 transition-colors">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        goal.completed ? 'bg-roman-green text-white' : 'border-2 border-gray-300'
                      }`}>
                      {goal.completed && <CheckCircle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <p className={`${goal.completed ? 'line-through text-gray-500' : ''}`}>{goal.task}</p>
                    </div>
                    <span className="text-sm font-medium text-roman-red">+{goal.points}pts</span>
                  </div>
                ))}

                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Daily Progress</span>
                    <span className="text-lg font-bold text-roman-red">25/90 pts</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-roman-red rounded-full" style={{ width: '28%' }}></div>
                  </div>
                </div>
              </RomanCardContent>
            </RomanCard>

            {/* Weekly Stats */}
            <RomanCard>
              <RomanCardHeader>
                <h3 className="text-2xl font-serif flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-roman-red" />
                  This Week&apos;s Progress
                </h3>
                <p className="text-roman-stone mt-1">Track your learning achievements</p>
              </RomanCardHeader>
              <RomanCardContent>
                <div className="grid grid-cols-2 gap-6">
                  {weeklyStats.map((stat, index) => (
                    <div key={index} className="text-center p-4 rounded-lg bg-roman-parchment/30">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-${stat.color}/20`}>
                        <stat.icon className={`h-6 w-6 text-${stat.color}`} />
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
                      <div className="text-sm text-roman-stone">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </RomanCardContent>
            </RomanCard>
          </div>
        </div>
      </main>
    </div>
  );
}
