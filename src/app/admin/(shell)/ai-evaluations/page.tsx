'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  CopyPlus,
  Database,
  DollarSign,
  FileText,
  FlaskConical,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPage,
  AdminPageHeader,
} from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import { Switch } from '@/src/components/ui/switch';
import { RomanCard, RomanCardContent, RomanCardHeader } from '@/src/components/ui/core/roman-card';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { toast } from 'sonner';
import { TRANSLATION_GRADING_PROFILES } from '@/shared/openai/model-registry';
import type {
  EvaluationAggregate,
  EvaluationCase,
  EvaluationCaseInput,
  EvaluationCellResult,
  EvaluationRunResult,
} from '@/src/lib/ai-evaluations/contracts';
import {
  deleteEvaluationCaseInFirebase,
  listEvaluationCasesInFirebase,
  runEvaluationInFirebase,
  saveEvaluationCaseInFirebase,
} from '@/src/lib/ai-evaluations/firebase-client';

const newAnswer = (index: number) => ({ id: `answer-${Date.now()}-${index}`, label: `Answer ${index}`, text: '' });

const blankCase = (): EvaluationCaseInput => ({
  title: '',
  direction: 'latin-to-english',
  sourceText: '',
  answers: [newAnswer(1)],
});

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatDuration = (milliseconds: number) => {
  if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
};
const formatCost = (value: number) => (value === 0 ? '$0.000000' : `$${value.toFixed(6)}`);
const formatMeasuredCost = (value: number | undefined, status: string, lowerBound = false) => {
  if (status === 'unavailable' || value === undefined) return 'Unavailable';
  if (status === 'not-incurred-app-cache' || status === 'not-incurred-coalesced') return 'No API call';
  return `${lowerBound ? '≥' : ''}${formatCost(value)}`;
};

const profileFor = (key: EvaluationCellResult['modelKey']) => TRANSLATION_GRADING_PROFILES[key];

type DisplayedRun = {
  result: EvaluationRunResult;
  evaluationCase: EvaluationCaseInput;
};

function isValidCase(value: EvaluationCaseInput) {
  const ids = new Set(value.answers.map(answer => answer.id));
  return (
    value.title.trim().length > 0 &&
    value.sourceText.trim().length > 0 &&
    value.answers.length > 0 &&
    value.answers.every(answer => answer.label.trim() && answer.text.trim() && ids.size === value.answers.length)
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Clock3;
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-white/75 p-3">
      <div className="flex items-center gap-2 text-roman-stone">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-roman-stone">{detail}</p>}
    </div>
  );
}

function UsageBadges({ cell }: { cell: EvaluationCellResult }) {
  const usage = cell.usage;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Usage and cost">
      <Badge variant="outline" className="text-[10px] font-normal">
        run {formatDuration(cell.latencyMs)}
      </Badge>
      {cell.appCacheHit && cell.generationLatencyMs !== undefined && (
        <Badge variant="outline" className="text-[10px] font-normal">
          generated {formatDuration(cell.generationLatencyMs)}
        </Badge>
      )}
      {usage && (
        <>
          <Badge variant="outline" className="text-[10px] font-normal">
            {cell.appCacheHit || cell.coalescedDuplicate ? 'original ' : ''}
            {formatNumber(usage.totalTokens)} tokens
          </Badge>
          <Badge variant="outline" className="text-[10px] font-normal">
            in {formatNumber(usage.promptTokens)}
          </Badge>
          {(usage.cachedInputTokens ?? 0) > 0 && (
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-[10px] font-normal text-emerald-700">
              {cell.appCacheHit || cell.coalescedDuplicate ? 'original cached ' : 'cached '}
              {formatNumber(usage.cachedInputTokens ?? 0)}
            </Badge>
          )}
          {(usage.cacheWriteTokens ?? 0) > 0 && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-normal text-amber-700">
              cache write {formatNumber(usage.cacheWriteTokens ?? 0)}
            </Badge>
          )}
          {(usage.reasoningTokens ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] font-normal">
              reasoning {formatNumber(usage.reasoningTokens ?? 0)}
            </Badge>
          )}
        </>
      )}
      <Badge
        variant="outline"
        className={`text-[10px] font-normal ${cell.costIncurredThisRunStatus === 'unavailable' ? 'border-amber-200 text-amber-700' : ''}`}>
        API cost this run: {formatMeasuredCost(cell.costIncurredThisRun?.totalCost, cell.costIncurredThisRunStatus)}
      </Badge>
      {cell.appCacheHit && (
        <Badge className="border-blue-200 bg-blue-50 text-[10px] text-blue-700 hover:bg-blue-50">
          App cache · no API call
        </Badge>
      )}
      {cell.generatedAt && (
        <Badge variant="outline" className="text-[10px] font-normal">
          generated {new Date(cell.generatedAt).toLocaleString()}
        </Badge>
      )}
      {cell.coalescedDuplicate && !cell.appCacheHit && (
        <Badge className="border-blue-200 bg-blue-50 text-[10px] text-blue-700 hover:bg-blue-50">
          Deduped · no additional API call
        </Badge>
      )}
      {!cell.error && !cell.appCacheHit && cell.openAIPromptCacheHit && (
        <Badge className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 hover:bg-emerald-50">
          OpenAI prompt cache
        </Badge>
      )}
      {!cell.error && !cell.appCacheHit && !cell.openAIPromptCacheHit && (
        <Badge variant="outline" className="text-[10px] font-normal">
          Fresh API
        </Badge>
      )}
      {cell.error && !cell.coalescedDuplicate && (
        <Badge variant="outline" className="border-red-200 text-[10px] font-normal text-red-700">
          Provider request failed
        </Badge>
      )}
      {(cell.appCacheHit || cell.coalescedDuplicate) && (
        <Badge variant="outline" className="text-[10px] font-normal">
          Original generated cost: {formatMeasuredCost(cell.originalCost?.totalCost, cell.originalCostStatus)}
        </Badge>
      )}
      {cell.originalCostStatus === 'unavailable' && (
        <Badge variant="outline" className="border-amber-200 text-[10px] font-normal text-amber-700">
          Original generated cost unavailable
        </Badge>
      )}
    </div>
  );
}

function BreakdownDetails({ cell }: { cell: EvaluationCellResult }) {
  if (!cell.output) return null;
  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <details className="group rounded-md border border-border/60 bg-white/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium">
          <span>Segment breakdown</span>
          <ChevronDown
            className="h-3.5 w-3.5 text-roman-stone transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="overflow-x-auto border-t border-border/50">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-roman-marble/60 text-[10px] uppercase tracking-wider text-roman-stone">
              <tr>
                <th className="px-3 py-2">Source segment</th>
                <th className="px-3 py-2">Answer</th>
                <th className="px-3 py-2">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {cell.output.breakdown.map((item, index) => (
                <tr key={`${item.latinSegment}-${index}`} className="border-t border-border/40 align-top">
                  <td className="px-3 py-2 font-serif italic">{item.latinSegment}</td>
                  <td className="px-3 py-2 text-roman-stone">{item.yourTranslation}</td>
                  <td className="px-3 py-2">
                    <span className="mr-1 font-semibold text-primary">
                      {item.type === '✓' ? <Check className="inline h-3 w-3" /> : '!'}
                    </span>
                    {item.feedback}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="group rounded-md border border-border/60 bg-white/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium">
          <span>Grammatical analysis</span>
          <ChevronDown
            className="h-3.5 w-3.5 text-roman-stone transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-2 border-t border-border/50 p-3">
          {cell.output.grammaticalBreakdown.map((item, index) => (
            <div key={`${item.latinSegment}-${index}`} className="rounded-md bg-roman-marble/45 p-2.5 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-serif italic">{item.latinSegment}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {item.syntacticalRole}
                </span>
              </div>
              <p className="mt-1 text-foreground/80">{item.keyGrammaticalFeatures}</p>
              {item.notes && <p className="mt-1 text-[11px] italic text-roman-stone">{item.notes}</p>}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function ResultCell({ cell }: { cell: EvaluationCellResult }) {
  const profile = profileFor(cell.modelKey);
  if (cell.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/70 p-4" role="alert">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
          <X className="h-4 w-4" aria-hidden="true" />
          {profile.label}
        </div>
        <p className="mt-1 text-[11px] text-red-600">{cell.requestedModel}</p>
        <p className="mt-2 text-sm leading-relaxed text-red-700">{cell.error}</p>
        <div className="mt-3">
          <UsageBadges cell={cell} />
        </div>
        <p className="mt-2 text-[11px] text-red-600">
          This cell failed independently; the other model result is still available. Any measured usage is still
          included in the cost totals.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/80 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{profile.label}</p>
          <p className="mt-0.5 text-[11px] text-roman-stone">{cell.actualModel || cell.requestedModel}</p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-center">
          <p className="text-2xl font-serif font-bold leading-none text-primary">{cell.output?.grade}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-primary">Grade</p>
        </div>
      </div>
      <UsageBadges cell={cell} />
      <div className="mt-4 space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">Overall feedback</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/80">{cell.output?.notes}</p>
        </div>
        <div className="rounded-md border border-primary/10 bg-roman-marble/50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/80">Suggested translation</p>
          <p className="mt-1 font-serif text-sm italic leading-relaxed">{cell.output?.suggestedText}</p>
        </div>
        <BreakdownDetails cell={cell} />
      </div>
    </div>
  );
}

function ModelComparisonCards({ cells }: { cells: EvaluationCellResult[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {(['baseline', 'candidate'] as const).map(modelKey => {
        const profile = profileFor(modelKey);
        const modelCells = cells.filter(cell => cell.modelKey === modelKey);
        const uniqueCells = modelCells.filter(cell => !cell.duplicateWithinRun);
        const successfulCells = modelCells.filter(cell => cell.output);
        const usage = uniqueCells.reduce(
          (sum, cell) => ({
            promptTokens: sum.promptTokens + (cell.usage?.promptTokens ?? 0),
            completionTokens: sum.completionTokens + (cell.usage?.completionTokens ?? 0),
            totalTokens: sum.totalTokens + (cell.usage?.totalTokens ?? 0),
            ordinaryInputTokens: sum.ordinaryInputTokens + (cell.usage?.ordinaryInputTokens ?? 0),
            cachedInputTokens: sum.cachedInputTokens + (cell.usage?.cachedInputTokens ?? 0),
            cacheWriteTokens: sum.cacheWriteTokens + (cell.usage?.cacheWriteTokens ?? 0),
            reasoningTokens: sum.reasoningTokens + (cell.usage?.reasoningTokens ?? 0),
          }),
          {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            ordinaryInputTokens: 0,
            cachedInputTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
          }
        );
        const originalCost = uniqueCells.reduce((sum, cell) => sum + (cell.originalCost?.totalCost ?? 0), 0);
        const incurredCost = uniqueCells.reduce((sum, cell) => sum + (cell.costIncurredThisRun?.totalCost ?? 0), 0);
        const originalUnknown = uniqueCells.filter(cell => cell.originalCostStatus === 'unavailable').length;
        const incurredUnknown = uniqueCells.filter(cell => cell.costIncurredThisRunStatus === 'unavailable').length;
        const originalStatus =
          originalUnknown === 0
            ? 'measured'
            : modelCells.some(cell => cell.originalCost)
              ? 'lower-bound'
              : 'unavailable';
        const incurredStatus =
          incurredUnknown === 0
            ? 'measured'
            : modelCells.some(cell => cell.costIncurredThisRun)
              ? 'lower-bound'
              : 'unavailable';
        const generationTime = uniqueCells.reduce((sum, cell) => sum + (cell.generationLatencyMs ?? 0), 0);
        const actualModel = modelCells.find(cell => cell.actualModel)?.actualModel ?? profile.model;

        return (
          <RomanCard key={modelKey} className="border-border/80">
            <RomanCardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${modelKey === 'baseline' ? 'bg-roman-stone' : 'bg-primary'}`}
                      aria-hidden="true"
                    />
                    <h3 className="font-serif text-lg">{profile.label}</h3>
                  </div>
                  <p className="mt-1 text-[11px] text-roman-stone">
                    {actualModel} · reasoning {profile.reasoningEffort}
                  </p>
                </div>
                <Badge variant="outline">
                  {successfulCells.length}/{modelCells.length} complete
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-md bg-roman-marble/55 p-2">
                  <p className="text-roman-stone">Original tokens</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{formatNumber(usage.totalTokens)}</p>
                </div>
                <div className="rounded-md bg-roman-marble/55 p-2">
                  <p className="text-roman-stone">Input / cached</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {formatNumber(usage.promptTokens)} / {formatNumber(usage.cachedInputTokens)}
                  </p>
                </div>
                <div className="rounded-md bg-roman-marble/55 p-2">
                  <p className="text-roman-stone">Output / reasoning</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {formatNumber(usage.completionTokens)} / {formatNumber(usage.reasoningTokens)}
                  </p>
                </div>
                <div className="rounded-md bg-roman-marble/55 p-2">
                  <p className="text-roman-stone">Cache writes</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{formatNumber(usage.cacheWriteTokens)}</p>
                </div>
                <div className="rounded-md bg-roman-marble/55 p-2">
                  <p className="text-roman-stone">Original generation</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{formatDuration(generationTime)}</p>
                </div>
                <div className="rounded-md bg-roman-marble/55 p-2">
                  <p className="text-roman-stone">Cache hits this run</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {uniqueCells.filter(cell => cell.appCacheHit || cell.openAIPromptCacheHit).length}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
                <span className="text-roman-stone">
                  API cost this run{' '}
                  <strong className="text-foreground">
                    {formatMeasuredCost(incurredCost, incurredStatus, incurredStatus === 'lower-bound')}
                  </strong>
                </span>
                <span className="text-roman-stone">
                  Original generated cost{' '}
                  <strong className="text-foreground">
                    {formatMeasuredCost(originalCost, originalStatus, originalStatus === 'lower-bound')}
                  </strong>
                </span>
              </div>
            </RomanCardContent>
          </RomanCard>
        );
      })}
    </div>
  );
}

function AggregateSummary({ aggregate }: { aggregate: EvaluationAggregate }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric
        icon={Gauge}
        label="Evaluated"
        value={`${aggregate.evaluatedCellCount}/${aggregate.cellCount}`}
        detail={`${aggregate.failedCellCount} failed`}
      />
      <Metric
        icon={Database}
        label="Provider tokens this run"
        value={formatNumber(aggregate.usageIncurredThisRun.totalTokens)}
        detail={`${aggregate.usageIncurredThisRunStatus === 'lower-bound' ? 'at least ' : ''}in ${formatNumber(aggregate.usageIncurredThisRun.promptTokens)} · out ${formatNumber(aggregate.usageIncurredThisRun.completionTokens)}`}
      />
      <Metric
        icon={DollarSign}
        label="API cost this run"
        value={formatMeasuredCost(
          aggregate.costIncurredThisRun?.totalCost,
          aggregate.costIncurredThisRunStatus,
          aggregate.costIncurredThisRunStatus === 'lower-bound'
        )}
        detail={`original generated: ${formatMeasuredCost(
          aggregate.originalCost?.totalCost,
          aggregate.originalCostStatus,
          aggregate.originalCostStatus === 'lower-bound'
        )}`}
      />
      <Metric
        icon={Clock3}
        label="Timing"
        value={formatDuration(aggregate.wallTimeMs)}
        detail={`provider work this run ${formatDuration(aggregate.providerTimeThisRunMs)}`}
      />
    </div>
  );
}

function AggregateDetails({ aggregate }: { aggregate: EvaluationAggregate }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-border/70 bg-roman-marble/45 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">Cache and run behavior</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-roman-stone">App cache hits</dt>
            <dd className="font-semibold tabular-nums">{aggregate.appCacheHits}</dd>
          </div>
          <div>
            <dt className="text-roman-stone">OpenAI cache hits</dt>
            <dd className="font-semibold tabular-nums">{aggregate.openAIPromptCacheHits}</dd>
          </div>
          <div>
            <dt className="text-roman-stone">Cache writes</dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(aggregate.usageIncurredThisRun.cacheWriteTokens ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-roman-stone">Reasoning tokens</dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(aggregate.usageIncurredThisRun.reasoningTokens ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-roman-stone">Unknown cost cells</dt>
            <dd className="font-semibold tabular-nums">
              {aggregate.unknownIncurredCostCells} this run · {aggregate.unknownOriginalCostCells} original
            </dd>
          </div>
        </dl>
      </div>
      <div className="rounded-lg border border-border/70 bg-roman-marble/45 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">Token and cost detail</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-roman-stone">Ordinary input</dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(aggregate.usageIncurredThisRun.ordinaryInputTokens ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-roman-stone">Cached input</dt>
            <dd className="font-semibold tabular-nums">
              {formatNumber(aggregate.usageIncurredThisRun.cachedInputTokens ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-roman-stone">Input cost this run</dt>
            <dd className="font-semibold tabular-nums">
              {formatMeasuredCost(
                aggregate.costIncurredThisRun?.inputCost,
                aggregate.costIncurredThisRunStatus,
                aggregate.costIncurredThisRunStatus === 'lower-bound'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-roman-stone">Output cost this run</dt>
            <dd className="font-semibold tabular-nums">
              {formatMeasuredCost(
                aggregate.costIncurredThisRun?.outputCost,
                aggregate.costIncurredThisRunStatus,
                aggregate.costIncurredThisRunStatus === 'lower-bound'
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Results({ result, evaluationCase }: { result: EvaluationRunResult; evaluationCase: EvaluationCaseInput }) {
  const sourceLanguage = evaluationCase.direction === 'latin-to-english' ? 'Latin' : 'English';
  const targetLanguage = evaluationCase.direction === 'latin-to-english' ? 'English' : 'Latin';
  return (
    <section aria-labelledby="evaluation-results-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="evaluation-results-heading" className="font-serif text-xl">
            Results
          </h2>
          <p className="mt-1 text-sm text-roman-stone">
            {result.forceRefresh ? 'Fresh API run completed.' : 'Successful cells reuse the app cache when available.'}{' '}
            Compare both profiles for each answer below.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 py-1">
          <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {result.aggregate.appCacheHits} app cache {result.aggregate.appCacheHits === 1 ? 'hit' : 'hits'}
        </Badge>
      </div>
      <div className="rounded-lg border border-border/70 bg-roman-marble/45 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
          <span>
            {sourceLanguage} → {targetLanguage}
          </span>
          <span aria-hidden="true">·</span>
          <span>Immutable run snapshot</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap font-serif italic leading-relaxed text-foreground/85">
          {evaluationCase.sourceText}
        </p>
      </div>
      <ModelComparisonCards cells={result.cells} />
      <AggregateSummary aggregate={result.aggregate} />
      <AggregateDetails aggregate={result.aggregate} />
      <div className="space-y-4">
        {evaluationCase.answers.map(answer => {
          const cells = result.cells.filter(cell => cell.answerId === answer.id);
          return (
            <RomanCard key={answer.id}>
              <RomanCardHeader className="border-b border-border/60 px-4 py-3 sm:px-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/[0.09] text-xs font-semibold text-primary">
                    {evaluationCase.answers.indexOf(answer) + 1}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium">{answer.label}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-roman-stone">{answer.text}</p>
                  </div>
                </div>
              </RomanCardHeader>
              <RomanCardContent className="grid gap-4 p-4 xl:grid-cols-2 sm:p-5">
                {cells.map(cell => (
                  <ResultCell key={`${cell.answerId}-${cell.modelKey}`} cell={cell} />
                ))}
              </RomanCardContent>
            </RomanCard>
          );
        })}
      </div>
    </section>
  );
}

function AIEvaluationsPage() {
  const [cases, setCases] = useState<EvaluationCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EvaluationCaseInput>(blankCase);
  const [savedForm, setSavedForm] = useState<EvaluationCaseInput | null>(null);
  const [displayedRun, setDisplayedRun] = useState<DisplayedRun | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [loadingCases, setLoadingCases] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (savedForm) return JSON.stringify(form) !== JSON.stringify(savedForm);
    const firstAnswer = form.answers[0];
    return Boolean(
      form.title.trim() ||
        form.sourceText.trim() ||
        form.answers.length !== 1 ||
        firstAnswer?.label !== 'Answer 1' ||
        firstAnswer?.text.trim()
    );
  }, [form, savedForm]);
  const valid = useMemo(() => isValidCase(form), [form]);
  const selectedCase = cases.find(item => item.id === selectedId) ?? null;
  const interactionLocked = running || saving || deleting;
  const runGenerationRef = useRef(0);
  const navigationGuard = useUnsavedNavigationGuard(
    dirty,
    'You have unsaved evaluation edits. Leave this page or switch cases without saving?'
  );
  const result = displayedRun?.result ?? null;

  const cloneCaseInput = (value: EvaluationCaseInput): EvaluationCaseInput => ({
    title: value.title,
    direction: value.direction,
    sourceText: value.sourceText,
    answers: value.answers.map(answer => ({ ...answer })),
  });

  const updateForm = (updater: (previous: EvaluationCaseInput) => EvaluationCaseInput) => {
    if (interactionLocked) return;
    runGenerationRef.current += 1;
    setDisplayedRun(null);
    setForm(updater);
  };

  const loadCases = async () => {
    setLoadingCases(true);
    setLoadError(null);
    try {
      const nextCases = await listEvaluationCasesInFirebase();
      setCases(nextCases);
      if (nextCases.length > 0) {
        const first = nextCases[0];
        setSelectedId(first.id);
        const nextForm = cloneCaseInput(first);
        setForm(nextForm);
        setSavedForm(cloneCaseInput(first));
        setDisplayedRun(null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load evaluation cases');
    } finally {
      setLoadingCases(false);
    }
  };

  const retryLoadCases = () => {
    navigationGuard.requestNavigation(() => void loadCases());
  };

  useEffect(() => {
    void loadCases();
    // Loading once avoids resetting an in-progress editor on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySelectedCase = (evaluationCase: EvaluationCase) => {
    runGenerationRef.current += 1;
    setSelectedId(evaluationCase.id);
    const nextForm = cloneCaseInput(evaluationCase);
    setForm(nextForm);
    setSavedForm(cloneCaseInput(evaluationCase));
    setDisplayedRun(null);
  };

  const selectCase = (evaluationCase: EvaluationCase) => {
    if (interactionLocked) return;
    navigationGuard.requestNavigation(() => applySelectedCase(evaluationCase));
  };

  const applyNewCase = () => {
    runGenerationRef.current += 1;
    setSelectedId(null);
    const nextForm = blankCase();
    setForm(nextForm);
    setSavedForm(null);
    setDisplayedRun(null);
  };

  const requestNewCase = () => {
    if (interactionLocked) return;
    navigationGuard.requestNavigation(applyNewCase);
  };

  const saveCase = async () => {
    if (interactionLocked || !valid) {
      toast.error('Complete the title, source, and at least one labeled answer before saving.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveEvaluationCaseInFirebase(form, selectedId ?? undefined);
      setCases(previous => {
        const withoutSaved = previous.filter(item => item.id !== saved.id);
        return [saved, ...withoutSaved];
      });
      runGenerationRef.current += 1;
      setSelectedId(saved.id);
      const nextForm = cloneCaseInput(saved);
      setForm(nextForm);
      setSavedForm(cloneCaseInput(saved));
      setDisplayedRun(null);
      toast.success(selectedId ? 'Evaluation case saved' : 'Evaluation case created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save evaluation case');
    } finally {
      setSaving(false);
    }
  };

  const deleteCase = async () => {
    if (!selectedId || interactionLocked) return;
    setDeleting(true);
    try {
      await deleteEvaluationCaseInFirebase(selectedId);
      const remaining = cases.filter(item => item.id !== selectedId);
      setCases(remaining);
      if (remaining.length > 0) applySelectedCase(remaining[0]);
      else applyNewCase();
      toast.success('Evaluation case deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete evaluation case');
    } finally {
      setDeleting(false);
    }
  };

  const runEvaluation = async () => {
    if (!selectedId || dirty || !valid || interactionLocked) return;
    const caseIdAtStart = selectedId;
    const caseSnapshot = cloneCaseInput(form);
    const requestGeneration = ++runGenerationRef.current;
    setRunning(true);
    setDisplayedRun(null);
    try {
      const response = await runEvaluationInFirebase({ caseId: caseIdAtStart, forceRefresh });
      if (requestGeneration !== runGenerationRef.current || response.caseId !== caseIdAtStart) {
        return;
      }
      setDisplayedRun({ result: response, evaluationCase: caseSnapshot });
      toast.success('Model comparison complete');
    } catch (error) {
      if (requestGeneration === runGenerationRef.current) {
        toast.error(error instanceof Error ? error.message : 'Unable to run model comparison');
      }
    } finally {
      if (requestGeneration === runGenerationRef.current) setRunning(false);
    }
  };

  const updateAnswer = (index: number, field: 'label' | 'text', value: string) => {
    updateForm(previous => ({
      ...previous,
      answers: previous.answers.map((answer, answerIndex) =>
        answerIndex === index
          ? {
              ...answer,
              [field]: value,
            }
          : answer
      ),
    }));
  };

  if (loadingCases) {
    return (
      <AdminPage>
        <AdminLoadingState label="Loading AI evaluation cases" />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminPageHeader
        title="AI Model Evaluations"
        description="Compare the production translation grader with GPT-5.6 Luna using repeatable, cost-aware cases."
        actions={
          <Button type="button" variant="outline" onClick={requestNewCase} disabled={interactionLocked}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            New case
          </Button>
        }
      />

      {loadError && <AdminErrorState message={loadError} onRetry={retryLoadCases} className="mb-6" />}

      <div className="grid gap-6 2xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside aria-label="Saved evaluation cases" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-roman-stone">Saved cases</p>
            <Badge variant="outline">{cases.length}</Badge>
          </div>
          {cases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-white/60 p-4 text-sm text-roman-stone">
              Create your first case to begin a comparison.
            </div>
          ) : (
            <div className="space-y-2">
              {cases.map(evaluationCase => (
                <button
                  type="button"
                  key={evaluationCase.id}
                  onClick={() => selectCase(evaluationCase)}
                  disabled={interactionLocked}
                  aria-pressed={selectedId === evaluationCase.id}
                  className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectedId === evaluationCase.id
                      ? 'border-primary/40 bg-primary/[0.07] shadow-sm'
                      : 'border-border/70 bg-white hover:border-primary/25 hover:bg-roman-marble/50'
                  }`}>
                  <p className="truncate text-sm font-medium">{evaluationCase.title}</p>
                  <p className="mt-1 text-[11px] text-roman-stone">
                    {evaluationCase.direction === 'latin-to-english' ? 'Latin → English' : 'English → Latin'} ·{' '}
                    {evaluationCase.answers.length} answers
                  </p>
                </button>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-border/60 bg-roman-marble/45 p-3 text-xs leading-relaxed text-roman-stone">
            <Sparkles className="mb-1 h-4 w-4 text-primary" aria-hidden="true" />
            API runs use the same grading prompt and schema as production. Successful cells are cached by model, prompt
            version, direction, source, and answer.
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <fieldset disabled={interactionLocked} className="min-w-0 border-0 p-0">
            <RomanCard>
              <RomanCardHeader className="border-b border-border/60 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/[0.09] text-primary">
                      <FlaskConical className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="font-serif text-lg">Case editor</h2>
                      <p className="mt-0.5 text-xs text-roman-stone">
                        Build one translation prompt with several answers to compare.
                      </p>
                    </div>
                  </div>
                  {dirty && (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
                      Unsaved changes
                    </Badge>
                  )}
                </div>
              </RomanCardHeader>
              <RomanCardContent className="space-y-5 p-5">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <Label htmlFor="evaluation-title">Case title</Label>
                    <Input
                      id="evaluation-title"
                      value={form.title}
                      maxLength={120}
                      placeholder="e.g. Cicero conditional sentence"
                      disabled={running}
                      onChange={event => updateForm(previous => ({ ...previous, title: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="evaluation-direction">Direction</Label>
                    <select
                      id="evaluation-direction"
                      value={form.direction}
                      disabled={running}
                      onChange={event =>
                        updateForm(previous => ({
                          ...previous,
                          direction: event.target.value as EvaluationCaseInput['direction'],
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="latin-to-english">Latin → English</option>
                      <option value="english-to-latin">English → Latin</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="evaluation-source">Source text</Label>
                  <Textarea
                    id="evaluation-source"
                    value={form.sourceText}
                    maxLength={4_000}
                    rows={4}
                    placeholder="Enter the source sentence shown to both models..."
                    disabled={running}
                    onChange={event => updateForm(previous => ({ ...previous, sourceText: event.target.value }))}
                  />
                  <p className="text-right text-[11px] text-roman-stone">
                    {form.sourceText.length.toLocaleString()} / 4,000
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Label>Answers to test</Label>
                      <p className="mt-1 text-xs text-roman-stone">
                        Keep alternatives labeled so differences are easy to scan.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={running || form.answers.length >= 20}
                      onClick={() =>
                        updateForm(previous => ({
                          ...previous,
                          answers: [...previous.answers, newAnswer(previous.answers.length + 1)],
                        }))
                      }>
                      <CopyPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                      Add answer
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {form.answers.map((answer, index) => (
                      <div key={answer.id} className="rounded-lg border border-border/70 bg-roman-marble/35 p-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary shadow-sm">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                              <div className="space-y-2">
                                <Label htmlFor={`answer-label-${answer.id}`}>Label</Label>
                                <Input
                                  id={`answer-label-${answer.id}`}
                                  value={answer.label}
                                  disabled={running}
                                  maxLength={80}
                                  placeholder={`Answer ${index + 1}`}
                                  onChange={event => updateAnswer(index, 'label', event.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`answer-text-${answer.id}`}>Student answer</Label>
                                <Textarea
                                  id={`answer-text-${answer.id}`}
                                  value={answer.text}
                                  disabled={running}
                                  maxLength={4_000}
                                  rows={2}
                                  placeholder="Enter a candidate student translation..."
                                  onChange={event => updateAnswer(index, 'text', event.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={running || form.answers.length <= 1}
                            aria-label={`Remove ${answer.label || `answer ${index + 1}`}`}
                            onClick={() =>
                              updateForm(previous => ({
                                ...previous,
                                answers: previous.answers.filter((_, answerIndex) => answerIndex !== index),
                              }))
                            }>
                            <Trash2 className="h-4 w-4 text-roman-stone" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                  <div className="flex items-center gap-2 text-xs text-roman-stone" role="status" aria-live="polite">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {selectedCase ? `Saved ${new Date(selectedCase.updatedAt).toLocaleString()}` : 'Not saved yet'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedId && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={running || deleting}
                        onClick={() => navigationGuard.requestNavigation(() => setDeleteOpen(true))}>
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Delete
                      </Button>
                    )}
                    <Button
                      type="button"
                      disabled={running || saving || !valid || !dirty}
                      onClick={() => void saveCase()}>
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                      )}
                      {saving ? 'Saving…' : 'Save case'}
                    </Button>
                  </div>
                </div>
              </RomanCardContent>
            </RomanCard>
          </fieldset>

          <RomanCard>
            <RomanCardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.09] text-primary">
                  <BarChart3 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-serif text-lg">Run side-by-side</h2>
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-roman-stone">
                    Both approved OpenAI profiles evaluate every saved answer concurrently. Cached results avoid
                    duplicate spend.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{TRANSLATION_GRADING_PROFILES.baseline.label}</Badge>
                    <Badge variant="outline">{TRANSLATION_GRADING_PROFILES.candidate.label}</Badge>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
                <label className="flex cursor-pointer items-center justify-end gap-2 text-xs text-roman-stone">
                  <Switch
                    checked={forceRefresh}
                    onCheckedChange={setForceRefresh}
                    disabled={interactionLocked}
                    aria-label="Force fresh API run"
                  />
                  Force fresh API run
                </label>
                <Button
                  type="button"
                  size="lg"
                  disabled={!selectedId || dirty || !valid || interactionLocked}
                  onClick={() => void runEvaluation()}>
                  {running ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {running ? 'Running models…' : 'Test models'}
                </Button>
                {dirty && <span className="text-[11px] text-amber-700">Save changes before running.</span>}
                {!selectedId && <span className="text-[11px] text-roman-stone">Save this case before running.</span>}
              </div>
            </RomanCardContent>
          </RomanCard>

          {running && (
            <div
              className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-4"
              role="status"
              aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Comparing both models…</p>
                <p className="mt-0.5 text-xs text-roman-stone">
                  Each answer/model cell is independent, so partial failures will remain visible.
                </p>
              </div>
            </div>
          )}

          {displayedRun && <Results result={displayedRun.result} evaluationCase={displayedRun.evaluationCase} />}
          {!result && !running && !selectedId && (
            <AdminEmptyState
              icon={Gauge}
              title="Your comparison will appear here"
              description="Save a case, then test the two model profiles side by side."
            />
          )}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={navigationGuard.isOpen}
        onClose={navigationGuard.stayOnPage}
        onConfirm={navigationGuard.leavePage}
        title="Leave without saving?"
        description={navigationGuard.message}
        confirmText="Leave without saving"
        confirmVariant="destructive"
      />

      <ConfirmationDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void deleteCase()}
        title="Delete this evaluation case?"
        description="This removes the saved case. Shared cache results are not deleted and expire automatically after 30 days."
        confirmText="Delete case"
        confirmVariant="destructive"
      />
    </AdminPage>
  );
}

export default withAdminAuth(AIEvaluationsPage);
