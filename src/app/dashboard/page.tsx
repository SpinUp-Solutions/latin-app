'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/services/firebase';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { toast } from 'sonner';
import { BookOpen, MessageCircle, Trophy, User } from 'lucide-react';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useSelector((state: RootState) => state.auth);

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

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  // Mock data for the dashboard
  const currentLesson = {
    title: 'Roman Forum Vocabulary',
    description: 'Master essential terms for discussing Roman civic life',
    progress: 65,
    timeLeft: '13 minutes left',
  };

  const lessons = [
    { title: 'Introduction to Latin', completed: true },
    { title: 'Basic Nouns and Cases', completed: true },
    { title: 'Roman Forum Vocabulary', completed: false, current: true },
    { title: 'Present Tense Verbs', completed: false },
    { title: 'Simple Conversations', completed: false },
  ];

  const dailyPractice = [
    {
      title: 'Vocabulary Review',
      description: '10 words • 5 minutes',
      icon: BookOpen,
    },
    {
      title: 'Translation Challenge',
      description: '3 sentences • 8 minutes',
      icon: MessageCircle,
    },
  ];

  const leaderboard = [
    { name: 'Marcus Aurelius', points: 2450, position: 1 },
    { name: 'Julia Augusta', points: 2340, position: 2 },
    { name: `${user.displayName || user.email?.split('@')[0]}`, points: 1890, position: 3, isUser: true },
    { name: 'Gaius Julius', points: 1780, position: 4 },
    { name: 'Livia Drusilla', points: 1650, position: 5 },
  ];

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
            <span className="text-xl">L</span>
          </div>
          <h1 className="text-xl font-serif tracking-wide">Latin App</h1>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            className="text-roman-stone hover:text-foreground/80 px-3 py-2 rounded-md text-sm font-medium flex items-center"
            onClick={() => router.push('/profile')}>
            <User className="h-5 w-5 mr-2" />
            Profile
          </Button>
          <Button onClick={handleSignOut}>Sign Out</Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="md:col-span-2 space-y-6">
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-serif text-gray-800">
                  Welcome, {user.displayName || user.email?.split('@')[0]}
                </h2>
                <span className="text-sm text-roman-stone">Daily streak: 7 days 🔥</span>
              </div>

              <RomanCard>
                <RomanCardHeader>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-roman-parchment flex items-center justify-center flex-shrink-0 border border-roman-terracotta/20">
                      <BookOpen className="h-6 w-6 text-roman-terracotta" />
                    </div>
                    <div>
                      <h3 className="text-xl font-serif">Lesson III: {currentLesson.title}</h3>
                      <p className="text-sm text-roman-stone">{currentLesson.description}</p>
                    </div>
                  </div>
                </RomanCardHeader>
                <RomanCardContent>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progress: {currentLesson.progress}%</span>
                    <span className="text-sm text-roman-stone">{currentLesson.timeLeft}</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-roman-red rounded-full"
                      style={{ width: `${currentLesson.progress}%` }}></div>
                  </div>
                </RomanCardContent>
                <div className="border-t border-border p-4 flex justify-between gap-2">
                  <Button variant="outline">Review Notes</Button>
                  <Button>Continue</Button>
                  <Button variant="secondary" onClick={() => router.push('/lesson')}>
                    Go to Lesson
                  </Button>
                </div>
              </RomanCard>
            </section>

            <section>
              <h2 className="text-2xl font-serif text-gray-800 mb-4">Course Curriculum</h2>
              <div className="w-full">
                <div className="bg-roman-parchment p-1 rounded-t-lg flex">
                  <Button variant="default" className="bg-white text-roman-red hover:bg-white/90 focus:bg-white">
                    Beginner
                  </Button>
                  <Button variant="ghost" className="text-gray-700 hover:text-roman-red">
                    Intermediate
                  </Button>
                  <Button variant="ghost" className="text-gray-700 hover:text-roman-red">
                    Advanced
                  </Button>
                </div>
                <div className="bg-white rounded-b-lg border border-border p-4 space-y-3">
                  {lessons.map((lesson, index) => (
                    <div
                      key={index}
                      className={`border-l-4 ${
                        lesson.current
                          ? 'border-l-roman-red'
                          : lesson.completed
                            ? 'border-l-roman-green'
                            : 'border-l-gray-200'
                      } bg-white rounded-lg shadow-sm`}>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              lesson.completed
                                ? 'bg-roman-green text-white'
                                : lesson.current
                                  ? 'bg-roman-red text-white'
                                  : 'bg-roman-parchment text-roman-stone'
                            }`}>
                            {lesson.completed ? '✓' : index + 1}
                          </div>
                          <span className={`font-medium ${lesson.current ? 'text-roman-red' : ''}`}>
                            {lesson.title}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant={lesson.completed ? 'ghost' : lesson.current ? 'default' : 'outline'}
                          className={`${lesson.completed ? 'text-roman-stone hover:text-gray-800' : lesson.current ? '' : 'border-gray-200 hover:bg-gray-50'}`}>
                          {lesson.completed ? 'Review' : lesson.current ? 'Continue' : 'Start'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <RomanCard>
              <RomanCardHeader className="bg-roman-red border-b-0">
                <h3 className="font-serif text-lg">Daily Practice</h3>
                <p className="text-sm opacity-90">Build your Latin skills with daily exercises</p>
              </RomanCardHeader>
              <RomanCardContent>
                {dailyPractice.map((practice, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between ${
                      index < dailyPractice.length - 1 ? 'mb-4 pb-4 border-b border-border' : ''
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-roman-parchment flex items-center justify-center">
                        <practice.icon className="h-5 w-5 text-roman-terracotta" />
                      </div>
                      <div>
                        <p className="font-medium">{practice.title}</p>
                        <p className="text-xs text-roman-stone">{practice.description}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="border-gray-200 hover:bg-gray-50">
                      Start
                    </Button>
                  </div>
                ))}
              </RomanCardContent>
            </RomanCard>

            <RomanCard>
              <RomanCardHeader>
                <h3 className="text-lg font-serif">Leaderboard</h3>
                <p className="text-sm text-roman-stone">This week's top Latin scholars</p>
              </RomanCardHeader>
              <RomanCardContent className="space-y-3">
                {leaderboard.map(userEntry => (
                  <div
                    key={userEntry.position}
                    className={`flex items-center justify-between p-2 rounded ${userEntry.isUser ? 'bg-roman-parchment' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                          userEntry.position === 1
                            ? 'bg-roman-gold text-white'
                            : userEntry.position === 2
                              ? 'bg-gray-400 text-white'
                              : userEntry.position === 3
                                ? 'bg-roman-terracotta text-white'
                                : 'bg-roman-marble text-roman-stone'
                        }`}>
                        {userEntry.position}
                      </div>
                      <span className={userEntry.isUser ? 'font-medium' : ''}>{userEntry.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Trophy className="h-4 w-4 text-roman-gold" />
                      <span className="font-medium">{userEntry.points}</span>
                    </div>
                  </div>
                ))}
              </RomanCardContent>
              <div className="border-t border-border p-4">
                <Button variant="link" className="text-roman-red hover:text-roman-red/90 w-full text-center">
                  View Full Rankings
                </Button>
              </div>
            </RomanCard>

            <RomanCard>
              <RomanCardHeader>
                <h3 className="text-lg font-serif">Account Information</h3>
              </RomanCardHeader>
              <RomanCardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-roman-stone">Email</p>
                    <p className="font-medium">{user.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-roman-stone">Role</p>
                    <p className="font-medium">
                      {user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Student'}
                    </p>
                  </div>
                </div>
              </RomanCardContent>
            </RomanCard>
          </div>
        </div>
      </main>
    </div>
  );
}
