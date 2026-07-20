'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Loader2 } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardContent, RomanCardHeader } from '@/src/components/ui/core/roman-card';
import { useAdminApi } from '@/src/hooks/useAdminApi';
import { toast } from 'sonner';

type Attempt = Record<string, unknown>;

const today = () => new Date().toISOString().slice(0, 10);

function DiagrammingAttemptsPage() {
  const { makeAdminRequest } = useAdminApi();
  const [lessonId, setLessonId] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [date, setDate] = useState(today);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAttempts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (lessonId.trim()) params.set('lessonId', lessonId.trim());
      if (exerciseId.trim()) params.set('exerciseId', exerciseId.trim());
      if (date) params.set('date', date);
      const response = await makeAdminRequest(`diagramming-attempts?${params.toString()}`);
      setAttempts(response.attempts || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load attempts');
    } finally {
      setLoading(false);
    }
  }, [date, exerciseId, lessonId, makeAdminRequest]);

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  return (
    <div className="min-h-screen bg-roman-marble p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Button asChild variant="ghost">
          <Link href="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Admin
          </Link>
        </Button>

        <RomanCard>
          <RomanCardHeader>
            <div className="flex items-center gap-3">
              <ClipboardList className="h-6 w-6 text-roman-red" />
              <div>
                <h1 className="text-2xl font-serif text-roman-red">Diagramming attempt audit</h1>
                <p className="text-sm text-roman-stone">Raw and canonical student and expected answers.</p>
              </div>
            </div>
          </RomanCardHeader>
          <RomanCardContent className="space-y-4">
            <form
              className="grid gap-3 md:grid-cols-4"
              onSubmit={event => {
                event.preventDefault();
                loadAttempts();
              }}>
              <input
                className="rounded border bg-white px-3 py-2 text-sm"
                placeholder="Lesson ID (optional)"
                value={lessonId}
                onChange={event => setLessonId(event.target.value)}
              />
              <input
                className="rounded border bg-white px-3 py-2 text-sm"
                placeholder="Exercise ID (optional)"
                value={exerciseId}
                onChange={event => setExerciseId(event.target.value)}
              />
              <input
                className="rounded border bg-white px-3 py-2 text-sm"
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
              />
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Filter attempts
              </Button>
            </form>
          </RomanCardContent>
        </RomanCard>

        <div className="space-y-3">
          {!loading && attempts.length === 0 && <p className="text-center text-roman-stone">No matching attempts.</p>}
          {attempts.map(attempt => (
            <details key={String(attempt.id)} className="rounded border bg-white p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{String(attempt.lessonId)} · {String(attempt.exerciseId)}</span>
                  <span className="text-sm tabular-nums text-roman-stone">
                    raw {String(attempt.rawStudentCount)}/{String(attempt.rawSolutionCount)} · canonical {String(attempt.canonicalStudentCount)}/{String(attempt.canonicalSolutionCount)} · matched {String(attempt.matched)}/{String(attempt.expected)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-roman-stone">User: {String(attempt.userId)} · page {Number(attempt.pageIndex) + 1}, item {Number(attempt.itemIndex) + 1}</div>
              </summary>
              <pre className="mt-4 max-h-[32rem] overflow-auto rounded bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(attempt, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

export default withAdminAuth(DiagrammingAttemptsPage);
