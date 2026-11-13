'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  CopyPlus,
  Clock3,
  Database,
  DollarSign,
  Gauge,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminErrorState, AdminLoadingState, AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { CopyMarkdownButton } from '@/src/components/admin/CopyMarkdownButton';
import { evaluationRunToMarkdown } from '@/src/lib/ai-evaluations/markdown-export';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Textarea } from '@/src/components/ui/textarea';
import { Badge } from '@/src/components/ui/badge';
import { TranslationGradingFeedback } from '@/src/components/ui/exercises/translation-grading-feedback';
import { Switch } from '@/src/components/ui/switch';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { toast } from 'sonner';
import { TRANSLATION_GRADING_MODES, type TranslationGradingMode } from '@/shared/openai/types';
import {
  EVALUATION_TRANSLATION_PROFILE_IDS,
  TRANSLATION_GRADING_PROFILES,
  type TranslationGradingProfileId,
} from '@/shared/openai/model-registry';
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
import { LESSON_EVALUATION_CASES } from '@/src/lib/ai-evaluations/lesson-cases';
import {
  compareProfiles,
  gradeAgreement,
  type GradeAgreement,
  type ProfileComparison,
} from '@/src/lib/ai-evaluations/comparison';

const newAnswer = (index: number) => ({ id: `answer-${Date.now()}-${index}`, label: `Answer ${index}`, text: '' });

const blankCase = (): EvaluationCaseInput => ({
  title: '',
  direction: 'latin-to-english',
  sourceText: '',
  answers: [newAnswer(1)],
  modes: ['lesson', 'test'],
});

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatDuration = (milliseconds: number) => {
  if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
};
const formatCost = (value: number) => (value === 0 ? '$0.000000' : `$${value.toFixed(6)}`);
const formatDollars = (value: number) => `$${value.toFixed(value >= 0.1 ? 2 : 3)}`;
const formatMeasuredCost = (value: number | undefined, status: string) => {
  if (status === 'unavailable' || value === undefined) return 'Unavailable';
  if (status === 'not-incurred-app-cache' || status === 'not-incurred-coalesced') return 'No API call';
  return `${status === 'lower-bound' ? '≥' : ''}${formatCost(value)}`;
};
const aggregateCostStatus = (anyUnknown: boolean, anyKnown: boolean) =>
  !anyUnknown ? 'measured' : anyKnown ? 'lower-bound' : 'unavailable';

const EXPAND_BUTTON_CLASS =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/[0.08] text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const MODE_LABELS: Record<TranslationGradingMode, string> = { lesson: 'Lesson feedback', test: 'Test scoring' };
const directionLabel = (direction: EvaluationCaseInput['direction']) =>
  direction === 'latin-to-english' ? 'Latin → English' : 'English → Latin';
const COMPARED_PROFILES = [EVALUATION_TRANSLATION_PROFILE_IDS[0], EVALUATION_TRANSLATION_PROFILE_IDS[1]] as const;
const profileLabel = (profileId: TranslationGradingProfileId) => TRANSLATION_GRADING_PROFILES[profileId].label;

function ProfileDot({ profileId }: { profileId: TranslationGradingProfileId }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${profileId === COMPARED_PROFILES[0] ? 'bg-roman-stone' : 'bg-primary'}`}
      aria-hidden="true"
    />
  );
}

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
    value.modes.length > 0 &&
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

const AGREEMENT_STYLES: Record<GradeAgreement, { label: string; className: string; bar: string }> = {
  same: { label: 'Same grade', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  close: { label: 'Close', className: 'border-amber-200 bg-amber-50 text-amber-700', bar: 'bg-amber-400' },
  different: { label: 'Different', className: 'border-red-200 bg-red-50 text-red-700', bar: 'bg-red-400' },
};

function ModelResult({
  cell,
  direction,
  showAdvanced,
}: {
  cell: EvaluationCellResult;
  direction: EvaluationCaseInput['direction'];
  showAdvanced: boolean;
}) {
  const header = (
    <div className="flex items-center gap-2">
      <ProfileDot profileId={cell.profileId} />
      <p className="text-sm font-medium">{profileLabel(cell.profileId)}</p>
    </div>
  );

  if (cell.error) {
    return (
      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/70 p-4" role="alert">
        {header}
        <p className="flex items-start gap-1.5 text-sm leading-relaxed text-red-700">
          <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {cell.error}
        </p>
        {showAdvanced && <UsageBadges cell={cell} />}
      </div>
    );
  }

  const cost =
    cell.originalCostStatus === 'unavailable' || !cell.originalCost ? null : formatCost(cell.originalCost.totalCost);
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-border/70 bg-white p-4">
      {cell.gradingMode === 'lesson' && cell.output ? (
        <>
          {header}
          {/* The same view students get in the translation exercise. */}
          <TranslationGradingFeedback
            data={cell.output}
            sourceLanguage={direction === 'latin-to-english' ? 'Latin' : 'English'}
            targetLanguage={direction === 'latin-to-english' ? 'English' : 'Latin'}
          />
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            {header}
            <span className="shrink-0 rounded-md bg-primary/[0.08] px-2.5 py-1 font-serif text-base font-bold leading-tight text-primary">
              {cell.gradingMode === 'test' ? `${cell.output?.score}/10` : null}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/85">
            {cell.gradingMode === 'test' ? cell.output?.feedback : null}
          </p>
        </>
      )}
      <p className="mt-auto flex items-center gap-3 text-xs tabular-nums text-roman-stone">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          {formatDuration(cell.generationLatencyMs ?? cell.latencyMs)}
        </span>
        <span className="inline-flex items-center gap-1">
          <DollarSign className="h-3 w-3" aria-hidden="true" />
          {cost ?? 'Cost unavailable'}
        </span>
      </p>
      {showAdvanced && <UsageBadges cell={cell} />}
    </div>
  );
}

function AnswerComparison({
  answer,
  index,
  cells,
  direction,
  showAdvanced,
}: {
  answer: EvaluationCaseInput['answers'][number];
  index: number;
  cells: EvaluationCellResult[];
  direction: EvaluationCaseInput['direction'];
  showAdvanced: boolean;
}) {
  const [first, second] = COMPARED_PROFILES.map(profileId => cells.find(cell => cell.profileId === profileId));
  const agreement = first && second ? gradeAgreement(first, second) : null;
  return (
    <RomanCard>
      <RomanCardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/[0.09] text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium">{answer.label}</h4>
            <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-roman-stone">{answer.text}</p>
          </div>
          {agreement && (
            <Badge variant="outline" className={`shrink-0 ${AGREEMENT_STYLES[agreement].className}`}>
              {AGREEMENT_STYLES[agreement].label}
            </Badge>
          )}
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {[first, second].map(
            cell =>
              cell && (
                <ModelResult
                  key={`${cell.answerId}-${cell.gradingMode}-${cell.profileId}`}
                  cell={cell}
                  direction={direction}
                  showAdvanced={showAdvanced}
                />
              )
          )}
        </div>
      </RomanCardContent>
    </RomanCard>
  );
}

function SummaryCard({
  title,
  headline,
  className = '',
  children,
}: {
  title: string;
  headline: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col rounded-xl border border-border/70 bg-white p-4 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-roman-stone">{title}</p>
      <p className="mt-1 font-serif text-xl leading-snug">{headline}</p>
      <div className="mt-3 flex-1 space-y-2">{children}</div>
    </div>
  );
}

function FigureRow({
  profileId,
  leader,
  value,
  detail,
}: {
  profileId: TranslationGradingProfileId;
  leader: boolean;
  value: string;
  detail?: string;
}) {
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex min-w-0 items-center gap-2 ${leader ? 'font-medium' : 'text-roman-stone'}`}>
          <ProfileDot profileId={profileId} />
          <span className="truncate">{profileLabel(profileId)}</span>
        </span>
        <span className={`shrink-0 tabular-nums ${leader ? 'font-semibold' : ''}`}>{value}</span>
      </div>
      {detail && <p className="pl-[18px] text-[11px] tabular-nums text-roman-stone">{detail}</p>}
    </div>
  );
}

function ComparisonSummary({ comparison }: { comparison: ProfileComparison }) {
  const { agreement, comparedCount, answerCount, costComparedCount, figures, faster, cheaper } = comparison;
  if (comparedCount === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-700" role="alert">
        No answer could be compared: a model failed on every one. The errors are shown below.
      </div>
    );
  }
  const leadHeadline = (lead: typeof faster, word: string, tie: string) =>
    lead ? (
      <>
        {TRANSLATION_GRADING_PROFILES[lead.profileId].label.split(' · ')[0]}{' '}
        <span className="text-primary">
          {word === 'cheaper'
            ? lead.percent === 100
              ? 'free'
              : `${Number((Math.max(...figures.map(item => item.averageCost)) / Math.min(...figures.map(item => item.averageCost))).toPrecision(2))}× cheaper`
            : `${Math.round(lead.percent)}% ${word}`}
        </span>
      </>
    ) : (
      tie
    );

  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      <SummaryCard
        title="Grading agreement"
        className="sm:col-span-2 2xl:col-span-1"
        headline={
          <>
            {agreement.same} of {comparedCount} <span className="text-base text-roman-stone">same grade</span>
          </>
        }>
        <div className="flex h-2 overflow-hidden rounded-full bg-roman-marble" aria-hidden="true">
          {(Object.keys(AGREEMENT_STYLES) as GradeAgreement[]).map(level =>
            agreement[level] > 0 ? (
              <span
                key={level}
                className={AGREEMENT_STYLES[level].bar}
                style={{ width: `${(agreement[level] / comparedCount) * 100}%` }}
              />
            ) : null
          )}
        </div>
        <p className="text-xs text-roman-stone">
          {agreement.same} same · {agreement.close} close · {agreement.different} different
        </p>
        {comparedCount < answerCount && (
          <p className="text-xs text-red-700">
            {answerCount - comparedCount} of {answerCount} answers not compared because a model failed.
          </p>
        )}
      </SummaryCard>
      <SummaryCard
        title="Cost"
        headline={leadHeadline(cheaper, 'cheaper', costComparedCount ? 'Same cost' : 'Unavailable')}>
        {costComparedCount > 0 &&
          figures.map(item => (
            <FigureRow
              key={item.profileId}
              profileId={item.profileId}
              leader={cheaper?.profileId === item.profileId}
              value={formatCost(item.averageCost)}
              detail={`${formatCost(item.totalCost)} for this case · ≈ ${formatDollars(item.averageCost * 1_000)} per 1,000`}
            />
          ))}
        <p className="text-[11px] text-roman-stone">Average cost to grade one answer.</p>
        {costComparedCount < comparedCount && (
          <p className="text-xs text-amber-700">
            Based on {costComparedCount} of {comparedCount} answers; the other costs are unavailable.
          </p>
        )}
      </SummaryCard>
      <SummaryCard title="Speed" headline={leadHeadline(faster, 'faster', 'Same speed')}>
        {figures.map(item => (
          <FigureRow
            key={item.profileId}
            profileId={item.profileId}
            leader={faster?.profileId === item.profileId}
            value={formatDuration(item.averageMs)}
          />
        ))}
        <p className="text-[11px] text-roman-stone">Average time to generate one grade.</p>
      </SummaryCard>
    </div>
  );
}

function ModelComparisonCards({ cells }: { cells: EvaluationCellResult[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {EVALUATION_TRANSLATION_PROFILE_IDS.map((profileId, profileIndex) => {
        const profile = TRANSLATION_GRADING_PROFILES[profileId];
        const modelCells = cells.filter(cell => cell.profileId === profileId);
        const uniqueCells = modelCells.filter(cell => !cell.duplicateWithinRun);
        const successfulCells = modelCells.filter(cell => cell.output);
        const usage = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
        };
        for (const cell of uniqueCells) {
          for (const key of Object.keys(usage) as Array<keyof typeof usage>) usage[key] += cell.usage?.[key] ?? 0;
        }
        const originalCost = uniqueCells.reduce((sum, cell) => sum + (cell.originalCost?.totalCost ?? 0), 0);
        const incurredCost = uniqueCells.reduce((sum, cell) => sum + (cell.costIncurredThisRun?.totalCost ?? 0), 0);
        const originalStatus = aggregateCostStatus(
          uniqueCells.some(cell => cell.originalCostStatus === 'unavailable'),
          modelCells.some(cell => cell.originalCost)
        );
        const incurredStatus = aggregateCostStatus(
          uniqueCells.some(cell => cell.costIncurredThisRunStatus === 'unavailable'),
          modelCells.some(cell => cell.costIncurredThisRun)
        );
        const generationTime = uniqueCells.reduce((sum, cell) => sum + (cell.generationLatencyMs ?? 0), 0);
        const actualModel = modelCells.find(cell => cell.actualModel)?.actualModel ?? profile.model;

        return (
          <RomanCard key={profileId} className="border-border/80">
            <RomanCardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${profileIndex === 0 ? 'bg-roman-stone' : 'bg-primary'}`}
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
                  <strong className="text-foreground">{formatMeasuredCost(incurredCost, incurredStatus)}</strong>
                </span>
                <span className="text-roman-stone">
                  Original generated cost{' '}
                  <strong className="text-foreground">{formatMeasuredCost(originalCost, originalStatus)}</strong>
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
        value={formatMeasuredCost(aggregate.costIncurredThisRun?.totalCost, aggregate.costIncurredThisRunStatus)}
        detail={`original generated: ${formatMeasuredCost(aggregate.originalCost?.totalCost, aggregate.originalCostStatus)}`}
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
              {formatMeasuredCost(aggregate.costIncurredThisRun?.inputCost, aggregate.costIncurredThisRunStatus)}
            </dd>
          </div>
          <div>
            <dt className="text-roman-stone">Output cost this run</dt>
            <dd className="font-semibold tabular-nums">
              {formatMeasuredCost(aggregate.costIncurredThisRun?.outputCost, aggregate.costIncurredThisRunStatus)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function AdvancedDetails({
  aggregate,
  mode,
  modeCells,
}: {
  aggregate: EvaluationAggregate;
  mode: TranslationGradingMode;
  modeCells: EvaluationCellResult[];
}) {
  return (
    <section
      aria-labelledby="evaluation-advanced-heading"
      className="space-y-4 rounded-xl border border-dashed border-border bg-roman-marble/30 p-4">
      <div>
        <h3 id="evaluation-advanced-heading" className="font-serif text-lg">
          Advanced details
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-roman-stone">
          Totals cover the whole run. “API cost this run” is what this run spent; reusing a cached result costs nothing.
          Successful results are cached for 30 days by mode, profile, prompt version, direction, source and answer.
        </p>
      </div>
      <AggregateSummary aggregate={aggregate} />
      <AggregateDetails aggregate={aggregate} />
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-roman-stone">
        {MODE_LABELS[mode]} by model
      </p>
      <ModelComparisonCards cells={modeCells} />
    </section>
  );
}

function Results({
  result,
  evaluationCase,
  showAdvanced,
}: {
  result: EvaluationRunResult;
  evaluationCase: EvaluationCaseInput;
  showAdvanced: boolean;
}) {
  const [selectedMode, setSelectedMode] = useState<TranslationGradingMode>(evaluationCase.modes[0]);
  const mode = evaluationCase.modes.includes(selectedMode) ? selectedMode : evaluationCase.modes[0];
  const modeCells = useMemo(() => result.cells.filter(cell => cell.gradingMode === mode), [result, mode]);
  const comparison = useMemo(() => compareProfiles(modeCells, COMPARED_PROFILES), [modeCells]);
  const { evaluatedCellCount, cellCount, failedCellCount } = result.aggregate;

  return (
    <section aria-labelledby="evaluation-results-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="evaluation-results-heading" className="font-serif text-xl">
            Results
          </h2>
          <p className="mt-1 text-xs text-roman-stone">
            {evaluatedCellCount} of {cellCount} gradings completed
            {failedCellCount > 0 && <span className="text-red-700"> · {failedCellCount} failed</span>}
            {result.forceRefresh && ' · fresh run, cache skipped'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {evaluationCase.modes.length > 1 && (
            <div className="inline-flex rounded-lg bg-roman-marble p-1" role="group" aria-label="Results grading mode">
              {evaluationCase.modes.map(item => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={item === mode}
                  onClick={() => setSelectedMode(item)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    item === mode ? 'bg-white text-foreground shadow-sm' : 'text-roman-stone hover:text-foreground'
                  }`}>
                  {MODE_LABELS[item]}
                </button>
              ))}
            </div>
          )}
          <CopyMarkdownButton
            label="Copy results as Markdown"
            getMarkdown={() => evaluationRunToMarkdown(result, evaluationCase, COMPARED_PROFILES)}
          />
        </div>
      </div>
      <h3 className="sr-only">{MODE_LABELS[mode]}</h3>
      <ComparisonSummary comparison={comparison} />
      {showAdvanced && <AdvancedDetails aggregate={result.aggregate} mode={mode} modeCells={modeCells} />}
      <div className="space-y-3">
        {evaluationCase.answers.map((answer, index) => (
          <AnswerComparison
            key={`${mode}-${answer.id}`}
            answer={answer}
            index={index}
            cells={modeCells.filter(cell => cell.answerId === answer.id)}
            direction={evaluationCase.direction}
            showAdvanced={showAdvanced}
          />
        ))}
      </div>
    </section>
  );
}

function AIEvaluationsPage() {
  const [cases, setCases] = useState<EvaluationCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<EvaluationCaseInput>(blankCase);
  const [savedForm, setSavedForm] = useState<EvaluationCaseInput | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [displayedRun, setDisplayedRun] = useState<DisplayedRun | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [loadingCases, setLoadingCases] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingLessonCases, setAddingLessonCases] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (savedForm) return JSON.stringify(form) !== JSON.stringify(savedForm);
    const firstAnswer = form.answers[0];
    return Boolean(
      form.title.trim() ||
        form.sourceText.trim() ||
        form.modes.length !== 2 ||
        form.answers.length !== 1 ||
        firstAnswer?.label !== 'Answer 1' ||
        firstAnswer?.text.trim()
    );
  }, [form, savedForm]);
  const valid = useMemo(() => isValidCase(form), [form]);
  const interactionLocked = running || saving || deleting || addingLessonCases;
  const missingLessonCases = LESSON_EVALUATION_CASES.filter(
    lessonCase => !cases.some(item => item.title === lessonCase.title)
  );
  const runGenerationRef = useRef(0);
  const navigationGuard = useUnsavedNavigationGuard(
    dirty,
    'You have unsaved evaluation edits. Leave this page or switch cases without saving?'
  );

  const cloneCaseInput = (value: EvaluationCaseInput): EvaluationCaseInput => ({
    title: value.title,
    direction: value.direction,
    sourceText: value.sourceText,
    answers: value.answers.map(answer => ({ ...answer })),
    modes: [...value.modes],
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
      if (nextCases.length > 0) applySelectedCase(nextCases[0]);
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
    setForm(cloneCaseInput(evaluationCase));
    setSavedForm(cloneCaseInput(evaluationCase));
    setCollapsed(false);
    setDisplayedRun(null);
  };

  const selectCase = (evaluationCase: EvaluationCase) => {
    if (interactionLocked) return;
    navigationGuard.requestNavigation(() => applySelectedCase(evaluationCase));
  };

  const applyNewCase = () => {
    runGenerationRef.current += 1;
    setSelectedId(null);
    setForm(blankCase());
    setSavedForm(null);
    setCollapsed(false);
    setDisplayedRun(null);
  };

  const requestNewCase = () => {
    if (interactionLocked) return;
    navigationGuard.requestNavigation(applyNewCase);
  };

  const discardChanges = () => {
    if (interactionLocked || !savedForm) return;
    setForm(cloneCaseInput(savedForm));
  };

  const saveCase = async () => {
    if (interactionLocked || !valid) {
      toast.error('Complete the title, source, and at least one labeled answer before saving.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveEvaluationCaseInFirebase(form, selectedId ?? undefined);
      setCases(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      applySelectedCase(saved);
      toast.success(selectedId ? 'Evaluation case saved' : 'Evaluation case created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save evaluation case');
    } finally {
      setSaving(false);
    }
  };

  const addLessonCases = async () => {
    if (interactionLocked || loadError || missingLessonCases.length === 0) return;
    setAddingLessonCases(true);
    const added: EvaluationCase[] = [];
    try {
      // Saved last to first so the newest-first list keeps lesson order.
      for (const lessonCase of [...missingLessonCases].reverse()) {
        added.unshift(await saveEvaluationCaseInFirebase(lessonCase));
      }
      toast.success(`Added ${added.length} lesson ${added.length === 1 ? 'case' : 'cases'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to add lesson cases');
    } finally {
      setCases(previous => [...added, ...previous]);
      if (!selectedId && !dirty && added.length > 0) applySelectedCase(added[0]);
      setAddingLessonCases(false);
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
    setCollapsed(true);
    setRunning(true);
    setDisplayedRun(null);
    try {
      // The skip-cache switch lives under Advanced, so it never applies while hidden.
      const response = await runEvaluationInFirebase({
        caseId: caseIdAtStart,
        forceRefresh: showAdvanced && forceRefresh,
      });
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
        answerIndex === index ? { ...answer, [field]: value } : answer
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

  const editor = (
    <fieldset disabled={interactionLocked} className="min-w-0 border-0 p-0">
      <RomanCard>
        <RomanCardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-xl">{selectedId ? 'Edit case' : 'New case'}</h2>
            <div className="flex items-center gap-2">
              {dirty && (
                <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">Unsaved changes</Badge>
              )}
              {displayedRun && !dirty && (
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse case editor"
                  aria-expanded
                  className={EXPAND_BUTTON_CLASS}>
                  <ChevronUp className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="evaluation-title">Case title</Label>
              <Input
                id="evaluation-title"
                value={form.title}
                maxLength={120}
                placeholder="e.g. Cicero conditional sentence"
                onChange={event => updateForm(previous => ({ ...previous, title: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evaluation-direction">Direction</Label>
              <select
                id="evaluation-direction"
                value={form.direction}
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

          <div className="space-y-1.5">
            <Label htmlFor="evaluation-source">Source text</Label>
            <Textarea
              id="evaluation-source"
              value={form.sourceText}
              maxLength={4_000}
              rows={3}
              placeholder="The sentence the student translates"
              onChange={event => updateForm(previous => ({ ...previous, sourceText: event.target.value }))}
            />
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
                disabled={form.answers.length >= 20}
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
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <Label htmlFor={`answer-label-${answer.id}`}>Label</Label>
                        <Input
                          id={`answer-label-${answer.id}`}
                          value={answer.label}
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
                          maxLength={4_000}
                          rows={2}
                          placeholder="Enter a candidate student translation..."
                          onChange={event => updateAnswer(index, 'text', event.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={form.answers.length <= 1}
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

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium">Grade as</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Grading modes">
              {TRANSLATION_GRADING_MODES.map(mode => {
                const selected = form.modes.includes(mode);
                return (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    disabled={selected && form.modes.length === 1}
                    aria-pressed={selected}
                    onClick={() =>
                      updateForm(previous => {
                        const nextModes = selected
                          ? previous.modes.filter(current => current !== mode)
                          : [...previous.modes, mode];
                        return {
                          ...previous,
                          modes: TRANSLATION_GRADING_MODES.filter(current => nextModes.includes(current)),
                        };
                      })
                    }>
                    {selected && <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                    {MODE_LABELS[mode]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div>
              {selectedId && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => navigationGuard.requestNavigation(() => setDeleteOpen(true))}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              )}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showAdvanced && (
                  <label className="mr-1 flex cursor-pointer items-center gap-2 text-xs text-roman-stone">
                    <Switch
                      checked={forceRefresh}
                      onCheckedChange={setForceRefresh}
                      disabled={interactionLocked}
                      aria-label="Skip cache"
                    />
                    Skip cache
                  </label>
                )}
                {savedForm && dirty && (
                  <Button type="button" variant="ghost" onClick={discardChanges}>
                    Discard changes
                  </Button>
                )}
                <Button type="button" variant="outline" disabled={!valid || !dirty} onClick={() => void saveCase()}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {saving ? 'Saving…' : 'Save case'}
                </Button>
                <Button type="button" disabled={!selectedId || dirty || !valid} onClick={() => void runEvaluation()}>
                  {running ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {running ? 'Running…' : 'Run comparison'}
                </Button>
              </div>
              {(dirty || !selectedId) && (
                <p className="text-[11px] text-roman-stone">Save the case to run a comparison.</p>
              )}
            </div>
          </div>
        </RomanCardContent>
      </RomanCard>
    </fieldset>
  );

  const caseBanner = (
    <RomanCard>
      <RomanCardContent className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-lg">{form.title}</h2>
          <p className="truncate text-xs text-roman-stone">
            {directionLabel(form.direction)} · {form.answers.length} {form.answers.length === 1 ? 'answer' : 'answers'}{' '}
            · {profileLabel(COMPARED_PROFILES[0])} vs {profileLabel(COMPARED_PROFILES[1])}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          disabled={interactionLocked}
          aria-label="Expand case editor"
          aria-expanded={false}
          className={EXPAND_BUTTON_CLASS}>
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </button>
      </RomanCardContent>
    </RomanCard>
  );

  return (
    <AdminPage>
      <AdminPageHeader
        title="AI Model Evaluations"
        description="See how two grading models mark the same student answers, and what each one costs."
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-roman-stone">
              <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} aria-label="Show advanced details" />
              Advanced
            </label>
            <Button type="button" onClick={requestNewCase} disabled={interactionLocked}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New case
            </Button>
          </>
        }
      />

      {loadError && <AdminErrorState message={loadError} onRetry={retryLoadCases} className="mb-6" />}

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside aria-label="Saved evaluation cases" className="space-y-3 xl:sticky xl:top-6 xl:self-start">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-roman-stone">Cases</p>
            <span className="text-xs tabular-nums text-roman-stone">{cases.length}</span>
          </div>
          {cases.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-white/60 p-4 text-sm text-roman-stone">
              No cases yet. Write one, or add the ready-made lesson cases.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1 xl:max-h-[calc(100vh-16rem)]">
              {cases.map(evaluationCase => (
                <button
                  type="button"
                  key={evaluationCase.id}
                  onClick={() => selectCase(evaluationCase)}
                  disabled={interactionLocked}
                  aria-pressed={selectedId === evaluationCase.id}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
                    selectedId === evaluationCase.id
                      ? 'border-primary/40 bg-primary/[0.07]'
                      : 'border-transparent hover:bg-roman-marble/60'
                  }`}>
                  <p className="line-clamp-2 text-sm font-medium">{evaluationCase.title}</p>
                  <p className="mt-0.5 text-[11px] text-roman-stone">
                    {directionLabel(evaluationCase.direction)} · {evaluationCase.answers.length}{' '}
                    {evaluationCase.answers.length === 1 ? 'answer' : 'answers'}
                  </p>
                </button>
              ))}
            </div>
          )}
          {missingLessonCases.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => void addLessonCases()}
              disabled={interactionLocked || Boolean(loadError)}>
              {addingLessonCases ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {addingLessonCases ? 'Adding…' : 'Add lesson cases'}
            </Button>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          {collapsed ? caseBanner : editor}

          {running && (
            <div
              className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-4"
              role="status"
              aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">Both models are grading each answer…</p>
            </div>
          )}

          {displayedRun && (
            <Results
              result={displayedRun.result}
              evaluationCase={displayedRun.evaluationCase}
              showAdvanced={showAdvanced}
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
