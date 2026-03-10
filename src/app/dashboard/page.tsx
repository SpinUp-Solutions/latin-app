'use client';

import React, { memo, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/services/firebase';
import { useGetStudentLessonsQuery } from '@/src/store/api/lessonApi';
import { useAuth } from '@/src/hooks/useAuth';
import { LessonStatus, LessonWithProgress } from '@/src/types/lesson';
import { Button } from '@/src/components/ui/button';
import { toast } from 'sonner';
import { BookOpen, User } from 'lucide-react';
import Image from 'next/image';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { CircularProgressButton } from '@/src/components/ui/CircularProgressButton';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import 'swiper/css/navigation';
import { SwiperNavigation } from '@/src/components/ui/core/swiper-nav';
import { PracticeSection } from '@/src/components/ui/core/PracticeSection';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';

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

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, displayName } = useAuth();

  const { data: studentLessons, isLoading: lessonsLoading } = useGetStudentLessonsQuery(undefined, {
    skip: !user?.uid,
  });

  const normalLessons = useMemo(() => {
    if (!studentLessons) return [];
    return studentLessons
      .filter(lesson => lesson.type === 'normal')
      .map(lesson => ({
        ...lesson,
        totalPages: lesson.pages.length,
      }));
  }, [studentLessons]);

  const vocabLessons = useMemo(() => {
    if (!studentLessons) return [];
    return studentLessons
      .filter(lesson => lesson.type === 'vocab')
      .map(lesson => ({
        ...lesson,
        totalPages: lesson.pages.length,
      }));
  }, [studentLessons]);

  const diagrammingLessons = useMemo(() => {
    if (!studentLessons) return [];
    return studentLessons
      .filter(lesson => lesson.type === 'sentence-diagramming')
      .map(lesson => ({
        ...lesson,
        totalPages: lesson.pages.length,
      }));
  }, [studentLessons]);

  const listeningLessons = useMemo(() => {
    if (!studentLessons) return [];
    return studentLessons
      .filter(lesson => lesson.type === 'listening')
      .map(lesson => ({
        ...lesson,
        totalPages: lesson.pages.length,
      }));
  }, [studentLessons]);

  const completionStats = useMemo(() => {
    if (normalLessons.length === 0) return { percentage: 0, completed: 0, total: 0 };
    const completed = normalLessons.filter(l => l.status === 'completed').length;
    const percentage = Math.round((completed / normalLessons.length) * 100);
    return { percentage, completed, total: normalLessons.length };
  }, [normalLessons]);

  const getInitialSlideIndex = useMemo(() => {
    if (normalLessons.length === 0) return 0;

    const inProgressIndex = normalLessons.findIndex(lesson => lesson.status === 'in-progress');
    if (inProgressIndex !== -1) return inProgressIndex;

    const availableIndex = normalLessons.findIndex(lesson => lesson.status === 'available');
    if (availableIndex !== -1) return availableIndex;

    return 0;
  }, [normalLessons]);

  const handleLessonClick = useCallback(
    (lessonId: string) => {
      const allLessons = [...normalLessons, ...vocabLessons, ...diagrammingLessons, ...listeningLessons];
      const lesson = allLessons.find(l => l.id === lessonId);

      if (lesson?.status === 'locked') {
        toast.error('Complete the previous lesson to unlock this one');
        return;
      }

      router.push(`/lesson/${lessonId}`);
    },
    [router, normalLessons, vocabLessons, diagrammingLessons, listeningLessons]
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
              width={64}
              height={64}
              className="w-14 h-14"
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

        <main className="px-8 py-12">
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
                {normalLessons.length > 0 && (
                  <div className="text-right">
                    <div className="text-4xl font-serif text-transparent bg-clip-text bg-gradient-to-r from-roman-red to-roman-terracotta mb-2">
                      {completionStats.percentage}% Complete
                    </div>
                    <div className="text-lg text-roman-stone leading-relaxed">
                      {completionStats.completed} of {completionStats.total} lessons finished
                    </div>
                  </div>
                )}
              </div>

              {normalLessons.length === 0 ? (
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

                    {normalLessons.map(lesson => (
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

            <section className="mb-16">
              <PracticeSection
                vocabLessons={vocabLessons}
                diagrammingLessons={diagrammingLessons}
                listeningLessons={listeningLessons}
              />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
