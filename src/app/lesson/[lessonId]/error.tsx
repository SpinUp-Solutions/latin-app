'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { reportUnexpectedError } from '@/src/lib/report-unexpected-error';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';

export default function LessonError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams();
  const lessonId = typeof params?.lessonId === 'string' ? params.lessonId : undefined;

  useEffect(() => {
    reportUnexpectedError(error, {
      tags: {
        surface: 'lesson_error_boundary',
        ...(lessonId ? { lessonId } : {}),
      },
      extra: error.digest ? { digest: error.digest } : undefined,
    });
  }, [error, lessonId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-roman-marble p-6">
      <RomanCard className="w-full max-w-lg">
        <RomanCardContent className="space-y-4 p-8 text-center">
          <h1 className="font-serif text-2xl text-gray-900">Lesson failed to load</h1>
          <p className="text-gray-600">An unexpected error interrupted this lesson. You can try again or return to the dashboard.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={() => reset()}>
              Try again
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard">Return to dashboard</Link>
            </Button>
          </div>
        </RomanCardContent>
      </RomanCard>
    </div>
  );
}
