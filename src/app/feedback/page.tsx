'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FeedbackComposer } from '@/src/components/student-feedback/FeedbackComposer';
import { useAuth } from '@/src/hooks/useAuth';
import { PageLoading } from '@/src/components/ui/page-loading';

export default function FeedbackPage() {
  const router = useRouter();
  const { authUid, loading } = useAuth();
  useEffect(() => {
    if (!loading && !authUid) router.replace('/login?return=%2Ffeedback');
  }, [loading, authUid, router]);
  if (loading || !authUid) return <PageLoading />;
  return <main className="min-h-screen bg-roman-marble px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-3xl rounded-xl border border-roman-gold/20 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-7 border-b border-roman-gold/20 pb-5">
        <Link href="/dashboard" className="text-sm text-roman-red hover:underline">← Back to dashboard</Link>
        <h1 className="mt-3 font-serif text-3xl text-roman-red">Share your feedback</h1>
        <p className="mt-2 text-roman-stone">Tell us what happened or what you would like to see improved.</p>
      </div>
      <FeedbackComposer entryPoint="standalone" />
    </div>
  </main>;
}
