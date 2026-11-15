'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Check, CopyPlus, Clock3, Database, DollarSign, Gauge, Trash2, X } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
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
import { EvaluationWorkbench } from '@/src/components/admin/evaluations/EvaluationWorkbench';
import { FigureRow, LeadHeadline, ProfileDot, SummaryCard } from '@/src/components/admin/evaluations/SummaryCard';
import type { EvaluationSuite } from '@/src/hooks/useEvaluationCases';
import { TRANSLATION_GRADING_MODES, type TranslationGradingMode } from '@/shared/openai/types';
import {
  EVALUATION_TRANSLATION_PROFILE_IDS,
  TRANSLATION_GRADING_PROFILES,
  type TranslationGradingProfileId,
} from '@/shared/openai/model-registry';
import {
  AI_EVALUATION_MAX_ANSWERS,
  evaluationCaseInputSchema,
  type EvaluationAggregate,
  type EvaluationCaseInput,
  type EvaluationCellResult,
  type EvaluationRunResult,
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

const MODE_LABELS: Record<TranslationGradingMode, string> = { lesson: 'Lesson feedback', test: 'Test scoring' };
const directionLabel = (direction: EvaluationCaseInput['direction']) =>
  direction === 'latin-to-english' ? 'Latin → English' : 'English → Latin';
const COMPARED_PROFILES = [EVALUATION_TRANSLATION_PROFILE_IDS[0], EVALUATION_TRANSLATION_PROFILE_IDS[1]] as const;
const profileLabel = (profileId: TranslationGradingProfileId) => TRANSLATION_GRADING_PROFILES[profileId].label;

const isPrimary = (profileId: TranslationGradingProfileId) => profileId === COMPARED_PROFILES[1];

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
      <ProfileDot primary={isPrimary(cell.profileId)} />
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

function ComparisonSummary({ comparison }: { comparison: ProfileComparison }) {
  const { agreement, comparedCount, answerCount, costComparedCount, figures, faster, cheaper } = comparison;
  if (comparedCount === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-700" role="alert">
        No answer could be compared: a model failed on every one. The errors are shown below.
      </div>
    );
  }
  const leadHeadline = (lead: typeof faster, word: 'cheaper' | 'faster', tie: string) =>
    lead ? (
      <LeadHeadline name={profileLabel(lead.profileId).split(' · ')[0]} percent={lead.percent} word={word} />
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
              label={profileLabel(item.profileId)}
              primary={isPrimary(item.profileId)}
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
            label={profileLabel(item.profileId)}
            primary={isPrimary(item.profileId)}
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
      {EVALUATION_TRANSLATION_PROFILE_IDS.map(profileId => {
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
                    <ProfileDot primary={isPrimary(profileId)} />
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
                {[
                  ['Original tokens', formatNumber(usage.totalTokens)],
                  ['Input / cached', `${formatNumber(usage.promptTokens)} / ${formatNumber(usage.cachedInputTokens)}`],
                  [
                    'Output / reasoning',
                    `${formatNumber(usage.completionTokens)} / ${formatNumber(usage.reasoningTokens)}`,
                  ],
                  ['Cache writes', formatNumber(usage.cacheWriteTokens)],
                  ['Original generation', formatDuration(generationTime)],
                  [
                    'Cache hits this run',
                    uniqueCells.filter(cell => cell.appCacheHit || cell.openAIPromptCacheHit).length,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-roman-marble/55 p-2">
                    <p className="text-roman-stone">{label}</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
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
  const usage = aggregate.usageIncurredThisRun;
  const costThisRun = (cost: number | undefined) => formatMeasuredCost(cost, aggregate.costIncurredThisRunStatus);
  const panels: Array<[string, Array<[string, ReactNode]>]> = [
    [
      'Cache and run behavior',
      [
        ['App cache hits', aggregate.appCacheHits],
        ['OpenAI cache hits', aggregate.openAIPromptCacheHits],
        ['Cache writes', formatNumber(usage.cacheWriteTokens ?? 0)],
        ['Reasoning tokens', formatNumber(usage.reasoningTokens ?? 0)],
        [
          'Unknown cost cells',
          `${aggregate.unknownIncurredCostCells} this run · ${aggregate.unknownOriginalCostCells} original`,
        ],
      ],
    ],
    [
      'Token and cost detail',
      [
        ['Ordinary input', formatNumber(usage.ordinaryInputTokens ?? 0)],
        ['Cached input', formatNumber(usage.cachedInputTokens ?? 0)],
        ['Input cost this run', costThisRun(aggregate.costIncurredThisRun?.inputCost)],
        ['Output cost this run', costThisRun(aggregate.costIncurredThisRun?.outputCost)],
      ],
    ],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {panels.map(([title, items]) => (
        <div key={title} className="rounded-lg border border-border/70 bg-roman-marble/45 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">{title}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {items.map(([label, value]) => (
              <div key={label}>
                <dt className="text-roman-stone">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
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

function CaseFields({
  form,
  updateForm,
}: {
  form: EvaluationCaseInput;
  updateForm: (updater: (previous: EvaluationCaseInput) => EvaluationCaseInput) => void;
}) {
  const updateAnswers = (update: (answers: EvaluationCaseInput['answers']) => typeof answers) =>
    updateForm(previous => ({ ...previous, answers: update(previous.answers) }));
  const updateAnswer = (index: number, field: 'label' | 'text', value: string) =>
    updateAnswers(answers =>
      answers.map((answer, answerIndex) => (answerIndex === index ? { ...answer, [field]: value } : answer))
    );

  return (
    <>
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
            <p className="mt-1 text-xs text-roman-stone">Keep alternatives labeled so differences are easy to scan.</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={form.answers.length >= AI_EVALUATION_MAX_ANSWERS}
            onClick={() => updateAnswers(answers => [...answers, newAnswer(answers.length + 1)])}>
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
                  onClick={() => updateAnswers(answers => answers.filter((_, answerIndex) => answerIndex !== index))}>
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
                  updateForm(previous => ({
                    ...previous,
                    modes: TRANSLATION_GRADING_MODES.filter(current =>
                      current === mode ? !selected : previous.modes.includes(current)
                    ),
                  }))
                }>
                {selected && <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
                {MODE_LABELS[mode]}
              </Button>
            );
          })}
        </div>
      </div>
    </>
  );
}

const SUITE: EvaluationSuite<EvaluationCaseInput, EvaluationRunResult> = {
  blankCase,
  inputSchema: evaluationCaseInputSchema,
  listCases: listEvaluationCasesInFirebase,
  saveCaseInput: saveEvaluationCaseInFirebase,
  deleteCaseById: deleteEvaluationCaseInFirebase,
  runCase: runEvaluationInFirebase,
  starterCases: LESSON_EVALUATION_CASES,
  starterLabel: 'lesson',
};

const caseSubtitle = (value: EvaluationCaseInput) =>
  `${directionLabel(value.direction)} · ${value.answers.length} ${value.answers.length === 1 ? 'answer' : 'answers'}`;

function AIEvaluationsPage() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <EvaluationWorkbench
      suite={SUITE}
      title="AI Model Evaluations"
      description="See how two grading models mark the same student answers, and what each one costs."
      loadingLabel="Loading AI evaluation cases"
      headerActions={
        <label className="flex cursor-pointer items-center gap-2 text-sm text-roman-stone">
          <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} aria-label="Show advanced details" />
          Advanced
        </label>
      }
      canSkipCache={showAdvanced}
      caseSubtitle={caseSubtitle}
      caseSummary={form =>
        `${caseSubtitle(form)} · ${profileLabel(COMPARED_PROFILES[0])} vs ${profileLabel(COMPARED_PROFILES[1])}`
      }
      runningMessage={() => 'Both models are grading each answer…'}
      renderFields={(form, updateForm) => <CaseFields form={form} updateForm={updateForm} />}
      renderResults={run => (
        <Results result={run.result} evaluationCase={run.evaluationCase} showAdvanced={showAdvanced} />
      )}
    />
  );
}

export default withAdminAuth(AIEvaluationsPage);
