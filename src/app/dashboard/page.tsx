'use client';

import { useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/services/firebase';
import type { RootState, AppDispatch } from '@/src/store';
import { loadStudentLessons } from '@/src/store/slices/lessonSlice';
import { loadBatchUserProgress, resetProgress } from '@/src/store/slices/progressSlice';
import { getContentCount } from '@/src/utils/lessonUtils';
import { Button } from '@/src/components/ui/button';
import { toast } from 'sonner';
import React from 'react';
import { BookOpen, User, Clock, Target, TrendingUp, CheckCircle, Play } from 'lucide-react';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { LessonStatus } from '@/src/types/lesson';

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, loading } = useSelector((state: RootState) => state.auth);
  const { studentLessons, loading: lessonsLoading } = useSelector((state: RootState) => state.lesson);
  const progressState = useSelector((state: RootState) => state.progress.currentProgress);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    } else if (user) {
      dispatch(loadStudentLessons());
    }
  }, [user, loading, router, dispatch]);

  const loadAllProgress = useCallback(() => {
    if (user?.uid) {
      dispatch(loadBatchUserProgress(user.uid));
    }
  }, [dispatch, user?.uid]);

  useEffect(() => {
    loadAllProgress();
  }, [loadAllProgress]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadAllProgress();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadAllProgress]);

  const lessons = useMemo(() => {
    return studentLessons.map(lesson => {
      const userProgress = progressState[lesson.id];
      const contentCount = getContentCount(lesson);

      let progress = 0;
      let exercisesCompleted = 0;
      let status: LessonStatus = 'available';

      if (userProgress) {
        progress = userProgress.progress || 0;
        exercisesCompleted = userProgress.exerciseProgress?.length || 0;
        status =
          userProgress.status === 'completed'
            ? 'completed'
            : userProgress.status === 'in-progress'
              ? 'in-progress'
              : 'available';
      }

      return {
        ...lesson,
        progress,
        status,
        exercisesCompleted,
        totalExercises: contentCount.exerciseItems,
        totalIntroPages: contentCount.introPages,
        userProgress,
      };
    });
  }, [studentLessons, progressState]);

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
        dispatch(resetProgress());
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

  const todaysGoals = [
    { task: 'Complete current lesson', completed: false, points: 50 },
    { task: 'Review 15 vocabulary words', completed: true, points: 30 },
    { task: 'Practice pronunciation', completed: false, points: 20 },
  ];

  const weeklyStats = [
    { label: 'Lessons Completed', value: 2, icon: CheckCircle, color: 'roman-green' },
    { label: 'Words Learned', value: 89, icon: BookOpen, color: 'roman-red' },
    { label: 'Study Time', value: '4.2h', icon: Clock, color: 'roman-gold' },
    { label: 'Current Streak', value: '7 days', icon: TrendingUp, color: 'roman-terracotta' },
  ];

  const statusConfig: Record<
    LessonStatus,
    { card: string; icon: string; button: string; text: string; showIcon: JSX.Element | null }
  > = {
    completed: {
      card: 'border-roman-green bg-roman-green/5',
      icon: 'bg-roman-green text-white',
      button: 'bg-roman-green hover:bg-roman-green/90',
      text: 'Review',
      showIcon: <CheckCircle className="h-6 w-6" />,
    },
    current: {
      card: 'border-roman-red bg-roman-red/5',
      icon: 'bg-roman-red text-white',
      button: 'bg-roman-red hover:bg-roman-red/90',
      text: 'Continue',
      showIcon: null,
    },
    upcoming: {
      card: 'border-roman-gold bg-roman-gold/5',
      icon: 'bg-roman-gold text-white',
      button: 'bg-roman-gold hover:bg-roman-gold/90',
      text: 'Start',
      showIcon: null,
    },
    available: {
      card: 'border-roman-stone bg-roman-stone/5',
      icon: 'bg-roman-stone text-white',
      button: 'bg-roman-stone hover:bg-roman-stone/90',
      text: 'Start',
      showIcon: null,
    },
    'in-progress': {
      card: 'border-roman-terracotta bg-roman-terracotta/5',
      icon: 'bg-roman-terracotta text-white',
      button: 'bg-roman-terracotta hover:bg-roman-terracotta/90',
      text: 'Continue',
      showIcon: null,
    },
    locked: {
      card: 'border-gray-300 bg-gray-100',
      icon: 'bg-gray-300 text-gray-500',
      button: 'bg-gray-400 cursor-not-allowed',
      text: 'Locked',
      showIcon: null,
    },
  };

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
                  <div className="text-2xl font-serif text-roman-red">
                    {Math.round((lessons.filter(l => l.status === 'completed').length / lessons.length) * 100)}%
                    Complete
                  </div>
                  <div className="text-sm text-roman-stone">
                    {lessons.filter(l => l.status === 'completed').length} of {lessons.length} lessons finished
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {lessons.length === 0 ? (
                <RomanCard className="col-span-full">
                  <RomanCardContent className="p-12 text-center">
                    <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-2xl font-serif text-gray-700 mb-2">No Lessons Available</h3>
                    <p className="text-gray-500">
                      Check back soon! Your instructors are preparing amazing Latin lessons for you.
                    </p>
                  </RomanCardContent>
                </RomanCard>
              ) : (
                lessons.map((lesson, index) => (
                  <RomanCard
                    key={index}
                    className={`transition-all duration-200 hover:shadow-xl cursor-pointer hover:-translate-y-1 ${statusConfig[lesson.status]?.card || 'border-gray-300'}`}>
                    <RomanCardContent className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center ${statusConfig[lesson.status]?.icon || 'bg-gray-300 text-gray-500'}`}>
                          {statusConfig[lesson.status]?.showIcon || <BookOpen className="h-5 w-5" />}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-serif mb-2">{lesson.title}</h3>
                          <p className="text-sm text-roman-stone mb-3">{lesson.description}</p>

                          <div className="flex items-center gap-4 text-xs text-roman-stone mb-3">
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              {lesson.totalIntroPages || 0} intro pages
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              {lesson.totalExercises || 0} exercises
                            </span>
                          </div>

                          {(lesson.progress > 0 || lesson.exercisesCompleted > 0) && (
                            <div className="mb-4 space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-medium">Overall Progress</span>
                                <span className="text-xs font-semibold">{lesson.progress}%</span>
                              </div>
                              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    lesson.status === 'completed' ? 'bg-roman-green' : 'bg-roman-red'
                                  }`}
                                  style={{ width: `${lesson.progress}%` }}></div>
                              </div>

                              <div className="flex justify-between items-center">
                                <span className="text-xs text-roman-stone">Exercises Completed</span>
                                <span className="text-xs font-medium">
                                  {lesson.exercisesCompleted}/{lesson.totalExercises}
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-roman-terracotta rounded-full transition-all"
                                  style={{
                                    width: `${lesson.totalExercises > 0 ? (lesson.exercisesCompleted / lesson.totalExercises) * 100 : 0}%`,
                                  }}></div>
                              </div>

                              {lesson.userProgress?.exerciseProgress &&
                                lesson.userProgress.exerciseProgress.length > 0 && (
                                  <div className="text-xs text-roman-stone">
                                    Average Score: {lesson.userProgress.score || 'N/A'}
                                    {lesson.userProgress.score && '%'}
                                  </div>
                                )}
                            </div>
                          )}

                          <Button
                            className={`w-full ${statusConfig[lesson.status]?.button || 'bg-gray-400'}`}
                            onClick={() => router.push(`/lesson/${lesson.id}`)}>
                            <Play className="h-4 w-4 mr-2" />
                            {statusConfig[lesson.status]?.text || 'Start'}
                          </Button>
                        </div>
                      </div>
                    </RomanCardContent>
                  </RomanCard>
                ))
              )}
            </div>
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
