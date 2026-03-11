'use client';
import Link from 'next/link';
import Image from 'next/image';
import React from 'react';
import { ArrowRight, Scroll, BookOpen, Target } from 'lucide-react';
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
            <div className="relative">
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-roman-gold to-transparent"></div>

              <div className="flex justify-center mb-4 lg:mb-6">
                <Image
                  src="/assets/logos/wakeforest.png"
                  alt="Wake Forest University"
                  width={320}
                  height={200}
                  className="w-48 sm:w-64 lg:w-80 h-auto"
                  priority
                />
              </div>
              <h1 className="font-serif tracking-tight leading-none">
                <span className="block text-7xl sm:text-9xl lg:text-[12rem] text-transparent bg-clip-text bg-gradient-to-r from-roman-red via-roman-terracotta to-roman-gold drop-shadow-2xl">
                  Latin
                </span>
              </h1>

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

          <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="group bg-gradient-to-br from-roman-red/10 via-roman-red/5 to-roman-terracotta/5 border border-roman-red/20 backdrop-blur-sm rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-roman-red/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Scroll className="h-5 w-5 text-roman-red" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-900 mb-1">Smart Lessons</h3>
                  <p className="text-sm text-roman-stone leading-relaxed">
                    Adaptive learning that grows with your progress and understanding
                  </p>
                </div>
              </div>
            </div>

            <div className="group bg-gradient-to-br from-roman-gold/10 via-roman-gold/5 to-amber-100/5 border border-roman-gold/20 backdrop-blur-sm rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-roman-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <BookOpen className="h-5 w-5 text-roman-gold" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-900 mb-1">Classical Texts</h3>
                  <p className="text-sm text-roman-stone leading-relaxed">
                    Read Caesar, Cicero, and Virgil in their original glory
                  </p>
                </div>
              </div>
            </div>

            <div className="group bg-gradient-to-br from-roman-green/10 via-roman-green/5 to-emerald-100/5 border border-roman-green/20 backdrop-blur-sm rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-roman-green/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Target className="h-5 w-5 text-roman-green" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-900 mb-1">Track Progress</h3>
                  <p className="text-sm text-roman-stone leading-relaxed">
                    Visual insights and achievements to celebrate your journey
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
