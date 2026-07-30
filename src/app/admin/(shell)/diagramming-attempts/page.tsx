'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardContent, RomanCardHeader } from '@/src/components/ui/core/roman-card';
import { useAdminApi } from '@/src/hooks/useAdminApi';
import { toast } from 'sonner';
import { AdminEmptyState, AdminPage, AdminPageHeader } from '@/src/components/admin/shell';

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
    <AdminPage>
      <div className="space-y-6">
        <AdminPageHeader
          title="Diagramming Attempt Audit"
          description="Raw and canonical student and expected answers."
        />
        <RomanCard>
          <RomanCardHeader>
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-serif">Filter attempts</h2>
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
                className="h-9 rounded border bg-white px-3 text-sm"
                placeholder="Lesson ID (optional)"
                value={lessonId}
                onChange={event => setLessonId(event.target.value)}
              />
              <input
                className="h-9 rounded border bg-white px-3 text-sm"
                placeholder="Exercise ID (optional)"
                value={exerciseId}
                onChange={event => setExerciseId(event.target.value)}
              />
              <input
                className="h-9 rounded border bg-white px-3 text-sm"
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
              />
              <Button type="submit" size="sm" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Filter attempts
              </Button>
            </form>
          </RomanCardContent>
        </RomanCard>

        <div className="space-y-3">
          {!loading && attempts.length === 0 && (
            <AdminEmptyState
              icon={ClipboardList}
              title="No matching attempts"
              description="Adjust the filters to inspect a different set of diagramming submissions."
            />
          )}
          {attempts.map(attempt => (
            <details key={String(attempt.id)} className="rounded border bg-white p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {attempt.sourceKind === 'test-attempt'
                      ? `Test attempt ${String(attempt.testAttemptId)}`
                      : `Lesson ${String(attempt.lessonId)}`}{' '}
                    · {String(attempt.exerciseId)}
                  </span>
                  <span className="text-sm tabular-nums text-roman-stone">
                    raw {String(attempt.rawStudentCount)}/{String(attempt.rawSolutionCount)} · canonical{' '}
                    {String(attempt.canonicalStudentCount)}/{String(attempt.canonicalSolutionCount)} · matched{' '}
                    {String(attempt.matched)}/{String(attempt.expected)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-roman-stone">
                  User: {String(attempt.userId)} · page {Number(attempt.pageIndex) + 1}, item{' '}
                  {Number(attempt.itemIndex) + 1}
                </div>
              </summary>
              <pre className="mt-4 max-h-[32rem] overflow-auto rounded bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(attempt, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(DiagrammingAttemptsPage);
