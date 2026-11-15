'use client';

import { useState } from 'react';
import { Clock3, CopyPlus, Database, DollarSign, Trash2, X } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminSearchInput } from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { CopyMarkdownButton } from '@/src/components/admin/CopyMarkdownButton';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Badge } from '@/src/components/ui/badge';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { EvaluationWorkbench } from '@/src/components/admin/evaluations/EvaluationWorkbench';
import { FigureRow, LeadHeadline, ProfileDot, SummaryCard } from '@/src/components/admin/evaluations/SummaryCard';
import type { EvaluationSuite } from '@/src/hooks/useEvaluationCases';
import { PartOfSpeechSchema, type PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import {
  EVALUATION_VOCABULARY_AUTOCOMPLETE_PROFILE_IDS,
  VOCABULARY_AUTOCOMPLETE_PROFILES,
  type VocabularyAutocompleteProfileId,
} from '@/shared/openai/model-registry';
import {
  VOCABULARY_EVALUATION_MAX_ENTRIES,
  vocabularyEvaluationCaseInputSchema,
  type VocabularyEvaluationCaseInput,
  type VocabularyEvaluationCell,
  type VocabularyEvaluationRunResult,
} from '@/src/lib/vocabulary-autocomplete-evaluations/contracts';
import {
  deleteVocabularyEvaluationCaseInFirebase,
  listVocabularyEvaluationCasesInFirebase,
  runVocabularyEvaluationInFirebase,
  saveVocabularyEvaluationCaseInFirebase,
} from '@/src/lib/vocabulary-autocomplete-evaluations/firebase-client';
import { STARTER_VOCABULARY_EVALUATION_CASES } from '@/src/lib/vocabulary-autocomplete-evaluations/starter-cases';
import {
  summarizeVocabularyRun,
  type VocabularyRunSummary,
} from '@/src/lib/vocabulary-autocomplete-evaluations/comparison';
import {
  compareEntryForms,
  formMatchesQuery,
  PROSE_FIELDS,
  type FormAgreement,
  type FormCounts,
  type FormRow,
} from '@/src/utils/vocabulary/word-diff';
import { vocabularyRunToMarkdown } from '@/src/lib/vocabulary-autocomplete-evaluations/markdown-export';
import { MarkedText } from '@/src/components/ui/admin/vocabulary/MarkedText';

const PROFILES = [
  EVALUATION_VOCABULARY_AUTOCOMPLETE_PROFILE_IDS[0],
  EVALUATION_VOCABULARY_AUTOCOMPLETE_PROFILE_IDS[1],
] as const;
const profileLabel = (profileId: VocabularyAutocompleteProfileId) => VOCABULARY_AUTOCOMPLETE_PROFILES[profileId].label;
const modelName = (profileId: VocabularyAutocompleteProfileId) => profileLabel(profileId).split(' · ')[0];
const isPrimary = (profileId: VocabularyAutocompleteProfileId) => profileId === PROFILES[1];

const newEntry = (index: number) => ({
  id: `entry-${Date.now()}-${index}`,
  word: '',
  partOfSpeech: 'noun' as PartOfSpeech,
});
const blankCase = (): VocabularyEvaluationCaseInput => ({ title: '', entries: [newEntry(1)] });

const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatDuration = (milliseconds: number) =>
  milliseconds < 1_000 ? `${Math.max(0, Math.round(milliseconds))} ms` : `${(milliseconds / 1_000).toFixed(1)} s`;
const formatCost = (value: number) => `$${value.toFixed(value >= 0.01 ? 4 : 5)}`;
const formatDollars = (value: number) => `$${value.toFixed(value >= 10 ? 0 : 2)}`;
const formatShare = (share: number) => `${Math.round(share * 100)}%`;
const humanize = (segment: string) =>
  segment === 'nonFinite'
    ? 'non-finite'
    : segment
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase();
const fieldLabel = (field: string) => {
  const text = humanize(field);
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const posLabel = (partOfSpeech: PartOfSpeech) => fieldLabel(partOfSpeech);

const AGREEMENT_STYLES: Record<
  FormAgreement,
  { label: string; chip: string; row: string; bar: string; description: string }
> = {
  different: {
    label: 'Different',
    chip: 'border-red-200 bg-red-50 text-red-700',
    row: 'bg-red-50/80 border-l-red-400',
    bar: 'bg-red-400',
    description: 'The models gave different forms.',
  },
  missing: {
    label: 'One model only',
    chip: 'border-amber-200 bg-amber-50 text-amber-800',
    row: 'bg-amber-50/80 border-l-amber-400',
    bar: 'bg-amber-400',
    description: 'Only one model filled this form.',
  },
  macrons: {
    label: 'Macrons only',
    chip: 'border-sky-200 bg-sky-50 text-sky-700',
    row: 'bg-sky-50/80 border-l-sky-400',
    bar: 'bg-sky-400',
    description: 'Same letters, different vowel length marks or capitals.',
  },
  same: {
    label: 'Same',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    row: 'border-l-transparent',
    bar: 'bg-emerald-500',
    description: 'Identical.',
  },
};
const DIFFERENCE_KINDS: FormAgreement[] = ['different', 'missing', 'macrons'];

function AgreementBar({ counts }: { counts: FormCounts }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-roman-marble" aria-hidden="true">
      {(['same', 'macrons', 'missing', 'different'] as const).map(kind =>
        counts[kind] > 0 ? (
          <span
            key={kind}
            className={AGREEMENT_STYLES[kind].bar}
            style={{ width: `${(counts[kind] / counts.total) * 100}%` }}
          />
        ) : null
      )}
    </div>
  );
}

/** Output tokens against the cap; the darker part is reasoning. A full bar means the model ran out. */
function TokenBar({ cell }: { cell: VocabularyEvaluationCell }) {
  const output = cell.usage?.completionTokens ?? 0;
  const reasoning = cell.usage?.reasoningTokens ?? 0;
  const share = output / cell.maxOutputTokens;
  const exhausted = cell.errorCode === 'token-budget';
  const tone =
    exhausted || share >= 0.9
      ? { text: 'text-red-700', track: 'bg-red-300', reasoning: 'bg-red-600' }
      : share >= 0.6
        ? { text: 'text-amber-700', track: 'bg-amber-300', reasoning: 'bg-amber-600' }
        : { text: 'text-roman-stone', track: 'bg-primary/35', reasoning: 'bg-primary' };
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
        <span className="text-roman-stone">Output tokens</span>
        <span className={`font-medium ${tone.text}`}>
          {formatNumber(output)} / {formatNumber(cell.maxOutputTokens)} · {formatShare(share)}
        </span>
      </div>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-roman-marble"
        role="meter"
        aria-label={`${profileLabel(cell.profileId)} output tokens`}
        aria-valuemin={0}
        aria-valuemax={cell.maxOutputTokens}
        aria-valuenow={output}>
        <span className={tone.reasoning} style={{ width: `${Math.min(1, reasoning / cell.maxOutputTokens) * 100}%` }} />
        <span
          className={tone.track}
          style={{ width: `${Math.min(1, Math.max(0, output - reasoning) / cell.maxOutputTokens) * 100}%` }}
        />
      </div>
      <p className="text-[11px] tabular-nums text-roman-stone">
        {formatNumber(reasoning)} reasoning · {formatNumber(output - reasoning)} answer
      </p>
    </div>
  );
}

function ModelPanel({ cell }: { cell: VocabularyEvaluationCell }) {
  const failed = !cell.output;
  const usage = cell.usage;
  return (
    <div
      className={`flex min-w-0 flex-col gap-3 rounded-lg border p-4 ${failed ? 'border-red-200 bg-red-50/60' : 'border-border/70 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProfileDot primary={isPrimary(cell.profileId)} />
          <p className="truncate text-sm font-medium">{profileLabel(cell.profileId)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cell.errorCode === 'token-budget' && (
            <Badge variant="outline" className="border-red-300 bg-red-100 text-[10px] text-red-800">
              Ran out of output tokens
            </Badge>
          )}
          {cell.appCacheHit && (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">
              Cached · no API call
            </Badge>
          )}
        </div>
      </div>
      {failed && (
        <p className="flex items-start gap-1.5 text-sm leading-relaxed text-red-700" role="alert">
          <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {cell.error ?? 'The model returned no entry.'}
        </p>
      )}
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {(
          [
            [Clock3, 'Time', formatDuration(cell.generationLatencyMs)],
            [DollarSign, 'Cost', cell.cost ? formatCost(cell.cost.totalCost) : '—'],
            [Database, 'Input', usage ? formatNumber(usage.promptTokens) : '—'],
          ] as const
        ).map(([Icon, label, value]) => (
          <div key={label} className="rounded-md bg-roman-marble/55 p-2">
            <dt className="flex items-center gap-1 text-roman-stone">
              <Icon className="h-3 w-3" aria-hidden="true" /> {label}
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {value}
              {label === 'Input' && (usage?.cachedInputTokens ?? 0) > 0 && (
                <span className="font-normal text-emerald-700">
                  {' '}
                  ({formatNumber(usage!.cachedInputTokens!)} cached)
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {usage && <TokenBar cell={cell} />}
      <p className="text-[11px] text-roman-stone">
        {cell.actualModel ?? cell.requestedModel} · reasoning {cell.reasoningEffort}
        {cell.generatedAt && ` · generated ${new Date(cell.generatedAt).toLocaleString()}`}
      </p>
    </div>
  );
}

const proseText = (value: unknown) =>
  Array.isArray(value) ? value.filter(Boolean).join('; ') : typeof value === 'string' ? value : '';

function ProseComparison({ cells }: { cells: [VocabularyEvaluationCell, VocabularyEvaluationCell] }) {
  const fields = PROSE_FIELDS.filter(field => cells.some(cell => cell.output && field in cell.output));
  if (fields.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      {fields.map(field => (
        <div
          key={field}
          className="grid gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 text-sm last:border-b-0 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-roman-stone md:pt-0.5">
            {fieldLabel(field)}
          </p>
          {cells.map(cell => (
            <p key={cell.profileId} className="flex min-w-0 gap-2 leading-relaxed">
              <span className="mt-1.5 md:hidden">
                <ProfileDot primary={isPrimary(cell.profileId)} />
              </span>
              <span className={cell.output ? '' : 'text-roman-stone'}>
                {cell.output ? proseText(cell.output[field]) || '—' : 'No entry'}
              </span>
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

const formValue = (values: string[]) => (values.length ? values.join(' / ') : '—');
const MARK_STYLES: Partial<Record<FormAgreement, string>> = {
  different: 'bg-red-200/80',
  macrons: 'bg-sky-200/80',
};

/** A form's value with the letters that differ from the other model's value marked. */
function FormValue({ row, index }: { row: FormRow; index: number }) {
  const text = formValue(row.values[index]);
  const markClass = MARK_STYLES[row.agreement];
  return markClass ? <MarkedText text={text} other={formValue(row.values[1 - index])} markClass={markClass} /> : text;
}

function FormsTable({ rows }: { rows: FormRow[] }) {
  return (
    <div className="max-h-[32rem] overflow-auto rounded-lg border border-border/70">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-white text-left text-[11px] uppercase tracking-[0.1em] text-roman-stone shadow-[0_1px_0_hsl(var(--border))]">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Form
            </th>
            {PROFILES.map(profileId => (
              <th key={profileId} scope="col" className="px-3 py-2 font-semibold">
                <span className="flex items-center gap-1.5 normal-case tracking-normal">
                  <ProfileDot primary={isPrimary(profileId)} />
                  {modelName(profileId)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row, index) => {
            const heading =
              index === 0 || rows[index - 1].field !== row.field ? (
                <tr key={`${row.field}-heading`} className="bg-roman-marble/50">
                  <th
                    colSpan={3}
                    scope="colgroup"
                    className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-roman-stone">
                    {fieldLabel(row.field)}
                  </th>
                </tr>
              ) : null;
            const style = AGREEMENT_STYLES[row.agreement];
            return [
              heading,
              <tr
                key={row.key}
                data-agreement={row.agreement}
                className={`border-l-4 border-t border-t-border/50 ${style.row}`}>
                <th scope="row" className="px-3 py-1.5 text-left text-xs font-normal text-roman-stone">
                  {row.path.length ? row.path.map(humanize).join(' · ') : fieldLabel(row.field)}
                  {row.agreement !== 'same' && <span className="sr-only"> ({style.label})</span>}
                </th>
                {row.values.map((values, index) => (
                  <td
                    key={PROFILES[index]}
                    className={`px-3 py-1.5 font-serif ${row.agreement === 'same' ? '' : 'font-semibold'} ${values.length ? '' : 'text-roman-stone'}`}>
                    <FormValue row={row} index={index} />
                  </td>
                ))}
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormsComparison({ cells }: { cells: [VocabularyEvaluationCell, VocabularyEvaluationCell] }) {
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [first, second] = cells;
  if (!first.output || !second.output) {
    const failed = cells.filter(cell => !cell.output).map(cell => modelName(cell.profileId));
    return (
      <p className="rounded-lg border border-dashed border-red-200 bg-red-50/40 p-3 text-sm text-red-700">
        Forms not compared: {failed.join(' and ')} returned no entry.
      </p>
    );
  }
  const { rows, counts } = compareEntryForms(first.output, second.output);
  const differences = rows.filter(row => row.agreement !== 'same');
  if (counts.total === 0) {
    return <p className="text-sm text-roman-stone">This word has no inflected forms to compare.</p>;
  }
  // A search looks through every form, not only the differences on show.
  const searching = query.trim() !== '';
  const matches = searching ? rows.filter(row => formMatchesQuery(row, query)) : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 font-medium">
            {counts.same} of {counts.total} forms identical
          </span>
          {DIFFERENCE_KINDS.map(kind =>
            counts[kind] > 0 ? (
              <Badge key={kind} variant="outline" className={`font-normal ${AGREEMENT_STYLES[kind].chip}`}>
                {counts[kind]} {AGREEMENT_STYLES[kind].label.toLowerCase()}
              </Badge>
            ) : null
          )}
        </div>
        {differences.length > 0 && !searching && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowAll(value => !value)}>
            {showAll ? 'Show differences only' : `Show all ${counts.total} forms`}
          </Button>
        )}
      </div>
      <AdminSearchInput
        type="search"
        value={query}
        onValueChange={setQuery}
        placeholder="Search forms, e.g. subj perf pl, abl sg or amaver"
        label={`Search ${first.word} forms`}
        inputClassName="h-9 text-sm"
      />
      {searching ? (
        <>
          <p className="text-xs text-roman-stone" aria-live="polite">
            {matches.length} of {counts.total} forms match
          </p>
          {matches.length > 0 && <FormsTable rows={matches} />}
        </>
      ) : differences.length === 0 && !showAll ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-800">
          Every form matches.
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowAll(true)}>
            Show all {counts.total} forms
          </Button>
        </div>
      ) : (
        <FormsTable rows={showAll ? rows : differences} />
      )}
    </div>
  );
}

function entryVerdict(cells: [VocabularyEvaluationCell, VocabularyEvaluationCell]) {
  const [first, second] = cells;
  if (!first.output || !second.output) return { label: 'Failed', className: AGREEMENT_STYLES.different.chip };
  const { counts } = compareEntryForms(first.output, second.output);
  if (counts.total === 0) return { label: 'No inflected forms', className: 'border-border text-roman-stone' };
  const differences = counts.different + counts.missing;
  if (differences > 0) {
    return {
      label: `${differences} ${differences === 1 ? 'difference' : 'differences'}`,
      className: AGREEMENT_STYLES.different.chip,
    };
  }
  if (counts.macrons > 0) return { label: 'Macrons differ', className: AGREEMENT_STYLES.macrons.chip };
  return { label: 'Forms match', className: AGREEMENT_STYLES.same.chip };
}

function EntryComparison({
  index,
  cells,
}: {
  index: number;
  cells: [VocabularyEvaluationCell, VocabularyEvaluationCell];
}) {
  const verdict = entryVerdict(cells);
  return (
    <RomanCard>
      <RomanCardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/[0.09] text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <h3 className="font-serif text-xl">{cells[0].word}</h3>
          <Badge variant="outline" className="font-normal">
            {posLabel(cells[0].partOfSpeech)}
          </Badge>
          <Badge variant="outline" className={`ml-auto ${verdict.className}`}>
            {verdict.label}
          </Badge>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {cells.map(cell => (
            <ModelPanel key={cell.profileId} cell={cell} />
          ))}
        </div>
        <ProseComparison cells={cells} />
        <FormsComparison cells={cells} />
      </RomanCardContent>
    </RomanCard>
  );
}

function RunSummary({ summary }: { summary: VocabularyRunSummary }) {
  const { forms, figures, faster, cheaper, comparedCount, entryCount } = summary;
  const budgetFailures = figures.reduce((sum, item) => sum + item.tokenBudgetFailures, 0);
  const peak = figures.reduce((top, item) => (item.peakOutputShare > top.peakOutputShare ? item : top));
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <SummaryCard
        title="Forms"
        headline={
          forms.total ? (
            <>
              {formatShare(forms.same / forms.total)} <span className="text-base text-roman-stone">identical</span>
            </>
          ) : (
            'Nothing compared'
          )
        }>
        {forms.total > 0 && <AgreementBar counts={forms} />}
        <p className="text-xs text-roman-stone">
          {forms.same} same · {forms.macrons} macrons only · {forms.missing} one model only · {forms.different}{' '}
          different
        </p>
        <p className="text-xs text-roman-stone">
          {summary.identicalEntries} of {comparedCount} {comparedCount === 1 ? 'word' : 'words'} fully identical
        </p>
        {comparedCount < entryCount && (
          <p className="text-xs text-red-700">
            {entryCount - comparedCount} of {entryCount} words not compared because a model failed.
          </p>
        )}
      </SummaryCard>
      <SummaryCard
        title="Cost"
        headline={
          cheaper ? (
            <LeadHeadline name={modelName(cheaper.profileId)} percent={cheaper.percent} word="cheaper" />
          ) : summary.costComparedCount ? (
            'Same cost'
          ) : (
            'Unavailable'
          )
        }>
        {summary.costComparedCount > 0 &&
          figures.map(item => (
            <FigureRow
              key={item.profileId}
              label={profileLabel(item.profileId)}
              primary={isPrimary(item.profileId)}
              leader={cheaper?.profileId === item.profileId}
              value={formatCost(item.averageCost)}
              detail={`≈ ${formatDollars(item.averageCost * 1_000)} per 1,000 words like these`}
            />
          ))}
        <p className="text-[11px] text-roman-stone">Average cost to autocomplete one word.</p>
      </SummaryCard>
      <SummaryCard
        title="Speed"
        headline={
          faster ? (
            <LeadHeadline name={modelName(faster.profileId)} percent={faster.percent} word="faster" />
          ) : comparedCount ? (
            'Same speed'
          ) : (
            'Unavailable'
          )
        }>
        {comparedCount > 0 &&
          figures.map(item => (
            <FigureRow
              key={item.profileId}
              label={profileLabel(item.profileId)}
              primary={isPrimary(item.profileId)}
              leader={faster?.profileId === item.profileId}
              value={formatDuration(item.averageMs)}
            />
          ))}
        <p className="text-[11px] text-roman-stone">Average time to autocomplete one word.</p>
      </SummaryCard>
      <SummaryCard
        title="Output tokens"
        headline={
          budgetFailures > 0 ? (
            <span className="text-red-700">{budgetFailures} ran out of tokens</span>
          ) : (
            <>
              Peak {formatShare(peak.peakOutputShare)} <span className="text-base text-roman-stone">of the cap</span>
            </>
          )
        }>
        {figures.map(item => (
          <FigureRow
            key={item.profileId}
            label={profileLabel(item.profileId)}
            primary={isPrimary(item.profileId)}
            leader={false}
            value={`${formatShare(item.peakOutputShare)} peak`}
            detail={`${item.peakOutputWord ? `on ${item.peakOutputWord} · ` : ''}${formatNumber(item.averageOutputTokens)} avg per word${item.tokenBudgetFailures ? ` · ${item.tokenBudgetFailures} out of tokens` : ''}`}
          />
        ))}
        <p className="text-[11px] text-roman-stone">
          Share of the {formatNumber(VOCABULARY_AUTOCOMPLETE_PROFILES[PROFILES[0]].maxOutputTokens)}-token output cap
          the longest word used. Near 100% a word fails.
        </p>
      </SummaryCard>
    </div>
  );
}

function Results({
  result,
  evaluationCase,
}: {
  result: VocabularyEvaluationRunResult;
  evaluationCase: VocabularyEvaluationCaseInput;
}) {
  const summary = summarizeVocabularyRun(result.cells, PROFILES);
  const failed = result.cells.filter(cell => !cell.output).length;
  const costThisRun = result.cells.reduce((sum, cell) => sum + (cell.costThisRun?.totalCost ?? 0), 0);
  return (
    <section aria-labelledby="vocabulary-results-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="vocabulary-results-heading" className="font-serif text-xl">
            Results
          </h2>
          <p className="mt-1 text-xs text-roman-stone">
            {result.cells.length - failed} of {result.cells.length} autocompletes completed
            {failed > 0 && <span className="text-red-700"> · {failed} failed</span>} · run took{' '}
            {formatDuration(result.wallTimeMs)} · API cost this run {formatCost(costThisRun)}
            {result.forceRefresh && ' · cache skipped'}
          </p>
        </div>
        <CopyMarkdownButton
          label="Copy results as Markdown"
          getMarkdown={() => vocabularyRunToMarkdown(result, evaluationCase, PROFILES)}
        />
      </div>
      <RunSummary summary={summary} />
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-roman-stone"
        aria-label="Highlight key">
        {DIFFERENCE_KINDS.map(kind => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm border-l-4 ${AGREEMENT_STYLES[kind].row}`} aria-hidden="true" />
            <strong className="font-medium text-foreground">{AGREEMENT_STYLES[kind].label}:</strong>{' '}
            {AGREEMENT_STYLES[kind].description}
          </span>
        ))}
      </div>
      <div className="space-y-3">
        {evaluationCase.entries.map((entry, index) => {
          const pair = PROFILES.map(profileId =>
            result.cells.find(cell => cell.entryId === entry.id && cell.profileId === profileId)
          );
          if (!pair[0] || !pair[1]) return null;
          return <EntryComparison key={entry.id} index={index} cells={[pair[0], pair[1]]} />;
        })}
      </div>
    </section>
  );
}

const caseSubtitle = (value: VocabularyEvaluationCaseInput) =>
  `${value.entries.length} ${value.entries.length === 1 ? 'word' : 'words'} · ${[
    ...new Set(value.entries.map(entry => entry.partOfSpeech)),
  ].join(', ')}`;

function CaseFields({
  form,
  updateForm,
}: {
  form: VocabularyEvaluationCaseInput;
  updateForm: (updater: (previous: VocabularyEvaluationCaseInput) => VocabularyEvaluationCaseInput) => void;
}) {
  const updateEntries = (update: (entries: VocabularyEvaluationCaseInput['entries']) => typeof entries) =>
    updateForm(previous => ({ ...previous, entries: update(previous.entries) }));
  const updateEntry = (index: number, patch: Partial<VocabularyEvaluationCaseInput['entries'][number]>) =>
    updateEntries(entries =>
      entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry))
    );

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="vocabulary-evaluation-title">Case title</Label>
        <Input
          id="vocabulary-evaluation-title"
          value={form.title}
          maxLength={120}
          placeholder="e.g. Third-conjugation verbs"
          onChange={event => updateForm(previous => ({ ...previous, title: event.target.value }))}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>Words to autocomplete</Label>
            <p className="mt-1 text-xs text-roman-stone">
              Each word runs on both models. Up to {VOCABULARY_EVALUATION_MAX_ENTRIES} per case.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={form.entries.length >= VOCABULARY_EVALUATION_MAX_ENTRIES}
            onClick={() => updateEntries(entries => [...entries, newEntry(entries.length + 1)])}>
            <CopyPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add word
          </Button>
        </div>
        {form.entries.map((entry, index) => (
          <div
            key={entry.id}
            className="flex items-end gap-3 rounded-lg border border-border/70 bg-roman-marble/35 p-3">
            <span className="mb-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary shadow-sm">
              {index + 1}
            </span>
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="space-y-1.5">
                <Label htmlFor={`entry-word-${entry.id}`}>Word</Label>
                <Input
                  id={`entry-word-${entry.id}`}
                  value={entry.word}
                  maxLength={60}
                  placeholder="e.g. ferō"
                  className="font-serif"
                  onChange={event => updateEntry(index, { word: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`entry-pos-${entry.id}`}>Part of speech</Label>
                <select
                  id={`entry-pos-${entry.id}`}
                  value={entry.partOfSpeech}
                  onChange={event => updateEntry(index, { partOfSpeech: event.target.value as PartOfSpeech })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {PartOfSpeechSchema.options.map(option => (
                    <option key={option} value={option}>
                      {posLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={form.entries.length <= 1}
              aria-label={`Remove ${entry.word || `word ${index + 1}`}`}
              onClick={() => updateEntries(entries => entries.filter((_, entryIndex) => entryIndex !== index))}>
              <Trash2 className="h-4 w-4 text-roman-stone" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

const SUITE: EvaluationSuite<VocabularyEvaluationCaseInput, VocabularyEvaluationRunResult> = {
  blankCase,
  inputSchema: vocabularyEvaluationCaseInputSchema,
  listCases: listVocabularyEvaluationCasesInFirebase,
  saveCaseInput: saveVocabularyEvaluationCaseInFirebase,
  deleteCaseById: deleteVocabularyEvaluationCaseInFirebase,
  runCase: runVocabularyEvaluationInFirebase,
  starterCases: STARTER_VOCABULARY_EVALUATION_CASES,
  starterLabel: 'starter',
};

function VocabAutocompleteEvaluationsPage() {
  return (
    <EvaluationWorkbench
      suite={SUITE}
      title="Vocab Autocomplete Evaluation"
      description={`Autocomplete the same words with ${modelName(PROFILES[0])} and ${modelName(PROFILES[1])}, then compare the entries, cost, speed and token use.`}
      loadingLabel="Loading vocabulary evaluation cases"
      caseSubtitle={caseSubtitle}
      caseSummary={form =>
        `${form.entries.map(entry => entry.word).join(', ')} · ${profileLabel(PROFILES[0])} vs ${profileLabel(PROFILES[1])}`
      }
      runningMessage={form => (
        <>
          Both models are autocompleting each word…
          {form.entries.some(entry => entry.partOfSpeech === 'verb') && (
            <span className="font-normal text-roman-stone"> Verbs can take a few minutes.</span>
          )}
        </>
      )}
      renderFields={(form, updateForm) => <CaseFields form={form} updateForm={updateForm} />}
      renderResults={run => <Results result={run.result} evaluationCase={run.evaluationCase} />}
    />
  );
}

export default withAdminAuth(VocabAutocompleteEvaluationsPage);
