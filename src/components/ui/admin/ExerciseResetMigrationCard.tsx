'use client';

import React, { useMemo, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { useAdminApi } from '@/src/hooks/useAdminApi';

const DEFAULT_MAX_LEVEL_FAILURES = 2;

type RunMode = 'dry-run' | 'apply';

interface MigrationSummary {
  dryRun: boolean;
  maxLevelFailures: number;
  overwriteExisting: boolean;
  onlyWithEscalationLevels: boolean;
  lessonIds: string[];
  missingLessonIds: string[];
  lessonsScanned: number;
  lessonsUpdated: number;
  exercisesScanned: number;
  exercisesMatched: number;
  exercisesUpdated: number;
  exercisesSkippedExisting: number;
  exercisesSkippedNoEscalation: number;
  exercisesSkippedMissingFeedbackConfig: number;
  exercisesAlreadySet: number;
  sampleChanges: Array<Record<string, unknown>>;
  lessonErrors: Array<Record<string, unknown>>;
  batchesCommitted: number;
}

interface MigrationResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: MigrationSummary;
}

export function ExerciseResetMigrationCard() {
  const { makeAdminRequest } = useAdminApi();
  const [maxLevelFailures, setMaxLevelFailures] = useState(String(DEFAULT_MAX_LEVEL_FAILURES));
  const [lessonIds, setLessonIds] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [isRunning, setIsRunning] = useState<RunMode | null>(null);
  const [lastResult, setLastResult] = useState<MigrationResponse | null>(null);

  const parsedMaxLevelFailures = useMemo(() => {
    const parsed = Number.parseInt(maxLevelFailures, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [maxLevelFailures]);

  const submitMigration = async (mode: RunMode) => {
    if (parsedMaxLevelFailures === null) {
      toast.error('Wrong answers before reset must be a positive number.');
      return;
    }

    if (mode === 'apply') {
      const confirmed = window.confirm(
        `Apply this migration with a reset threshold of ${parsedMaxLevelFailures} wrong answers per question? This will update lesson documents in Firestore.`
      );

      if (!confirmed) {
        return;
      }
    }

    setIsRunning(mode);

    try {
      const payload = {
        maxLevelFailures: parsedMaxLevelFailures,
        lessonIds,
        overwriteExisting,
        onlyWithEscalationLevels: false,
        previewLimit: 25,
        dryRun: mode === 'dry-run',
        confirmWrite: mode === 'apply',
      };

      const result = (await makeAdminRequest('lessons/migrate-exercise-max-level-failures', {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as MigrationResponse;
      setLastResult(result);

      if (!result.success) {
        throw new Error(result.error || 'Migration request failed');
      }

      toast.success(result.message || (mode === 'dry-run' ? 'Dry run completed.' : 'Migration completed.'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Migration request failed';
      toast.error(message);
      setLastResult({
        success: false,
        error: message,
      });
    } finally {
      setIsRunning(null);
    }
  };

  return (
    <RomanCard className="hover:shadow-lg transition-shadow md:col-span-2 lg:col-span-3">
      <RomanCardContent className="p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <RotateCcw className="h-6 w-6 text-amber-700" />
          </div>
          <div>
            <h3 className="text-lg font-serif text-gray-800">Exercise Reset Migration</h3>
            <p className="text-sm text-roman-stone">
              Backfill per-question reset thresholds for existing exercises from the admin dashboard.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-800 mb-1">Wrong answers before reset</span>
            <input
              type="number"
              min="1"
              step="1"
              value={maxLevelFailures}
              onChange={event => setMaxLevelFailures(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-800 mb-1">Lesson IDs (optional)</span>
            <input
              type="text"
              value={lessonIds}
              onChange={event => setLessonIds(event.target.value)}
              placeholder="lesson-1, lesson-2"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={event => setOverwriteExisting(event.target.checked)}
            className="rounded border-gray-300"
          />
          Overwrite exercises that already have a reset threshold
        </label>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => submitMigration('dry-run')}
            disabled={isRunning !== null || parsedMaxLevelFailures === null}>
            {isRunning === 'dry-run' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Dry Run
          </Button>
          <Button
            onClick={() => submitMigration('apply')}
            disabled={isRunning !== null || parsedMaxLevelFailures === null}>
            {isRunning === 'apply' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Run Migration
          </Button>
        </div>

        <div className="text-xs text-roman-stone">
          Reset thresholds are question-based, not tied to escalation levels. By default this updates matching exercises
          whether or not they define escalation levels, unless they already have a reset threshold.
        </div>

        {lastResult ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 space-y-3">
            <div>
              <div className="text-sm font-medium text-gray-900">
                {lastResult.success ? 'Latest Result' : 'Last Error'}
              </div>
              <div className="text-sm text-roman-stone">{lastResult.message || lastResult.error}</div>
            </div>

            {lastResult.data ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-roman-stone">Lessons Scanned</div>
                    <div className="font-medium text-gray-900">{lastResult.data.lessonsScanned}</div>
                  </div>
                  <div>
                    <div className="text-roman-stone">Lessons Updated</div>
                    <div className="font-medium text-gray-900">{lastResult.data.lessonsUpdated}</div>
                  </div>
                  <div>
                    <div className="text-roman-stone">Exercises Scanned</div>
                    <div className="font-medium text-gray-900">{lastResult.data.exercisesScanned}</div>
                  </div>
                  <div>
                    <div className="text-roman-stone">Exercises Updated</div>
                    <div className="font-medium text-gray-900">{lastResult.data.exercisesUpdated}</div>
                  </div>
                </div>

                <pre className="max-h-80 overflow-auto rounded-md bg-stone-950 p-3 text-xs text-stone-100">
                  {JSON.stringify(lastResult.data, null, 2)}
                </pre>
              </>
            ) : null}
          </div>
        ) : null}
      </RomanCardContent>
    </RomanCard>
  );
}
