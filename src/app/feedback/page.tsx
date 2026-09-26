'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { FeedbackForm } from '@/src/components/student-feedback/FeedbackForm';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';
import { PageLoading } from '@/src/components/ui/page-loading';
import { useAuth } from '@/src/hooks/useAuth';
import { useFeedbackDraft } from '@/src/hooks/useFeedbackDraft';

function StandaloneFeedback() {
  const draft = useFeedbackDraft();
  return (
    <div className="min-h-screen bg-gradient-to-br from-roman-marble via-white to-roman-parchment">
      <header className="border-b border-roman-gold/20 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-roman-stone transition-colors hover:text-roman-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to dashboard
          </Link>
          <Image
            src="/assets/logos/wakeforest_shield.png"
            alt="Wake Forest University"
            width={1000}
            height={736}
            className="h-8 w-auto"
          />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-roman-red">Feedback</p>
          <h1 className="mt-2 font-serif text-3xl text-gray-950 sm:text-4xl">Share your feedback</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-roman-stone">
            Found a bug or have an idea? Tell us here and it goes straight to the course team.
          </p>
        </div>
        <div className="rounded-2xl border border-roman-gold/20 bg-white/90 p-5 shadow-xl shadow-roman-stone/5 sm:p-8">
          <FeedbackForm draft={draft} />
        </div>
      </main>
      <UnsavedNavigationDialog guard={draft.navigationGuard} />
    </div>
  );
}

export default function FeedbackPage() {
  const router = useRouter();
  const { authUid, loading } = useAuth();
  useEffect(() => {
    if (!loading && !authUid) router.replace('/login?return=%2Ffeedback');
  }, [loading, authUid, router]);
  if (loading || !authUid) return <PageLoading />;
  // Keyed by account so a different sign-in starts a fresh draft.
  return <StandaloneFeedback key={authUid} />;
}
