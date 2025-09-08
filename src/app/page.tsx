'use client';
import Link from 'next/link';
import React from 'react';
import { ArrowRight, Sparkles, Crown, Scroll, Target } from 'lucide-react';
import { Button } from '@/src/components/ui/button';

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-roman-marble via-white to-roman-parchment">
      {/* Enhanced background with more dramatic effects */}
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 lg:pt-32">
          {/*Hero Section */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center p-3 bg-gradient-to-r from-roman-red/20 to-roman-terracotta/15 rounded-2xl mb-12 backdrop-blur-sm border border-roman-red/20 shadow-xl">
              <div className="px-4 py-2 bg-white/90 rounded-xl flex items-center shadow-lg">
                <Crown className="h-4 w-4 text-roman-red mr-2" />
                <span className="text-sm font-bold text-roman-red uppercase tracking-wider">Classical Education</span>
                <Sparkles className="h-4 w-4 text-roman-gold ml-2" />
              </div>
            </div>

            <div className="relative">
              <h1 className="text-7xl sm:text-9xl lg:text-[12rem] font-serif tracking-tight leading-none">
                <span className="block text-gray-900 drop-shadow-sm">Learn</span>
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-roman-red via-roman-terracotta to-roman-gold -mt-4 lg:-mt-8 drop-shadow-2xl animate-pulse">
                  Latin
                </span>
              </h1>

              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-roman-gold to-transparent"></div>
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-roman-red to-transparent"></div>
            </div>

            <p className="mt-12 text-2xl sm:text-3xl text-gray-700 max-w-3xl mx-auto font-light leading-relaxed">
              Master the <span className="text-roman-red font-medium">timeless language</span> of Rome through
              <span className="text-roman-terracotta font-medium"> modern, interactive</span> lessons
            </p>

            <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-6">
              <Button
                size="lg"
                className="bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 text-white px-12 py-8 text-xl rounded-2xl shadow-2xl hover:shadow-3xl transition-all transform hover:-translate-y-1 hover:scale-105 border-2 border-gray-700"
                asChild>
                <Link href="/register">
                  Start Your Journey
                  <ArrowRight className="ml-3 h-6 w-6" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-gray-700 border-2 border-gray-300 hover:border-roman-red hover:text-roman-red px-12 py-8 text-xl rounded-2xl hover:bg-roman-red/5 transition-all transform hover:-translate-y-1 bg-transparent"
                asChild>
                <Link href="/login">I have an account</Link>
              </Button>
            </div>
          </div>

          <div className="mt-40 grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            <div className="group cursor-pointer transform hover:-translate-y-2 transition-all duration-300">
              <div className="relative h-64 bg-gradient-to-br from-roman-red/15 via-roman-red/10 to-roman-terracotta/5 rounded-3xl mb-6 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xl group-hover:shadow-2xl border border-roman-red/20 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl"></div>
                <Scroll className="h-16 w-16 text-roman-red drop-shadow-lg" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Smart Lessons</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Adaptive learning that grows with your progress and understanding
              </p>
            </div>

            <div className="group cursor-pointer transform hover:-translate-y-2 transition-all duration-300">
              <div className="relative h-64 bg-gradient-to-br from-roman-gold/20 via-roman-gold/15 to-amber-100/10 rounded-3xl mb-6 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xl group-hover:shadow-2xl border border-roman-gold/30 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl"></div>
                <Crown className="h-16 w-16 text-roman-gold drop-shadow-lg" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Classical Texts</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Read Caesar, Cicero, and Virgil in their original glory
              </p>
            </div>

            <div className="group cursor-pointer transform hover:-translate-y-2 transition-all duration-300">
              <div className="relative h-64 bg-gradient-to-br from-roman-green/15 via-roman-green/10 to-emerald-100/5 rounded-3xl mb-6 flex items-center justify-center group-hover:scale-105 transition-transform shadow-xl group-hover:shadow-2xl border border-roman-green/20 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-3xl"></div>
                <Target className="h-16 w-16 text-roman-green drop-shadow-lg" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Track Progress</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Visual insights and achievements to celebrate your journey
              </p>
            </div>
          </div>

          <div className="mt-40 text-center">
            <div className="inline-block relative">
              <div className="absolute inset-0 bg-gradient-to-r from-roman-red/10 via-roman-gold/10 to-roman-red/10 rounded-3xl blur-xl"></div>
              <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl px-12 py-8 border border-roman-red/20 shadow-2xl">
                <div className="text-lg text-roman-stone uppercase tracking-wider mb-4 font-medium">
                  Ready to begin?
                </div>
                <div className="text-5xl sm:text-6xl font-serif text-gray-900 leading-tight">
                  Carpe{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-roman-red to-roman-terracotta">
                    Diem
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
