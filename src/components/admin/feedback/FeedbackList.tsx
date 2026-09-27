'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, ChevronRight, Inbox, Paperclip, RefreshCw, Tag, User, X } from 'lucide-react';
import {
  FEEDBACK_AREAS,
  FEEDBACK_AREA_LABELS,
  FEEDBACK_SEVERITIES,
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  feedbackUuidSchema,
  type FeedbackAdminListItem,
} from '@/shared/student-feedback';
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminPage,
  AdminPageHeader,
  AdminSearchInput,
} from '@/src/components/admin/shell';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Switch } from '@/src/components/ui/switch';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  refreshFeedbackListPageOne,
  useGetAdminFeedbackCountQuery,
  useGetAdminFeedbackListQuery,
  type FeedbackListArgs,
} from '@/src/store/api/studentFeedbackApi';
import { useAppDispatch } from '@/src/store/hooks';
import { cn } from '@/src/lib/utils';
import { FeedbackBadges, FeedbackTypeIcon, formatDateTime, formatRelativeTime, submitterName } from './feedback-ui';

const ANY = 'any';
const STATUS_TABS = [
  { value: 'unresolved', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
] as const;
const FILTER_KEYS = ['type', 'severity', 'area', 'from', 'to', 'lessonId', 'submitterUid', 'submitterEmail'] as const;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Dates stay as local calendar days in the URL and become ISO bounds for the query. */
function isoFromDate(date: string | null, endOfDay = false): string | undefined {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number);
  const value = endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(year, month - 1, day);
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

function filtersFromParams(params: URLSearchParams): FeedbackListArgs {
  return {
    status: pick(params.get('status'), ['unresolved', 'resolved', 'all'] as const) ?? 'unresolved',
    archived: params.get('archived') === 'true' ? 'true' : 'false',
    sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest',
    type: pick(params.get('type'), FEEDBACK_TYPES),
    severity: pick(params.get('severity'), FEEDBACK_SEVERITIES),
    area: pick(params.get('area'), FEEDBACK_AREAS),
    from: isoFromDate(params.get('from')),
    to: isoFromDate(params.get('to'), true),
    lessonId: params.get('lessonId') || undefined,
    submitterUid: params.get('submitterUid') || undefined,
    submitterEmail: params.get('submitterEmail') || undefined,
  };
}

function FilterSelect<T extends string>({
  label,
  anyLabel,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  anyLabel: string;
  value: T | undefined;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T | null) => void;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={next => onChange(next === ANY ? null : (next as T))}>
      <SelectTrigger aria-label={label} className="bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {options.map(option => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterChip({ label, onRemove }: { label: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-0.5 pl-3 pr-1 text-xs font-medium text-foreground">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-roman-stone hover:bg-primary/10 hover:text-primary"
        aria-label="Remove filter">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function FeedbackRow({ item, href }: { item: FeedbackAdminListItem; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="group flex gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <FeedbackTypeIcon type={item.type} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{FEEDBACK_TYPE_LABELS[item.type]}</span>
            <FeedbackBadges report={item} />
            <time className="ml-auto text-xs text-roman-stone" dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
              {formatRelativeTime(item.createdAt)}
            </time>
          </div>
          <p className="mt-1.5 line-clamp-2 whitespace-pre-line break-words text-sm leading-relaxed text-foreground/90">
            {item.excerpt}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-roman-stone">
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              {submitterName(item.submitter)}
            </span>
            {item.lesson && (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <SimpleRichDisplay content={item.lesson.title} className="min-w-0 truncate text-xs text-roman-stone [&_p]:truncate" />
                {item.lesson.pageIndex !== null && <span className="shrink-0">· p. {item.lesson.pageIndex + 1}</span>}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              {item.areas.map(area => FEEDBACK_AREA_LABELS[area]).join(', ')}
            </span>
            {item.attachmentCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                {item.attachmentCount}
              </span>
            )}
          </div>
        </div>
        <ChevronRight
          className="hidden h-5 w-5 shrink-0 self-center text-roman-stone/60 transition-transform group-hover:translate-x-0.5 sm:block"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

export function FeedbackList() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(queryString)), [queryString]);
  // The cursor belongs to one filter combination, so a filter change starts from page one.
  const [paging, setPaging] = useState<{ key: string; cursor: string | null }>({ key: queryString, cursor: null });
  const cursor = paging.key === queryString ? paging.cursor : null;
  const [search, setSearch] = useState('');

  const { currentData, isLoading, isFetching, isError, error } = useGetAdminFeedbackListQuery({ ...filters, cursor });
  const count = useGetAdminFeedbackCountQuery(undefined, { refetchOnFocus: true });
  const items = currentData?.items ?? [];
  const returnHref = `/admin/feedback${queryString ? `?${queryString}` : ''}`;
  const params = new URLSearchParams(queryString);
  const hasFilters = FILTER_KEYS.some(key => params.get(key));

  const navigate = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(queryString);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const nextQuery = next.toString();
    router.replace(`/admin/feedback${nextQuery ? `?${nextQuery}` : ''}`, { scroll: false });
  };

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    if (!value) return;
    if (feedbackUuidSchema.safeParse(value).success) {
      router.push(`/admin/feedback/${value.toLowerCase()}?return=${encodeURIComponent(returnHref)}`);
      return;
    }
    navigate(value.includes('@') ? { submitterEmail: value, submitterUid: null } : { submitterUid: value, submitterEmail: null });
    setSearch('');
  };

  const refresh = () => {
    setPaging({ key: queryString, cursor: null });
    void refreshFeedbackListPageOne(dispatch, filters);
    void count.refetch();
  };

  const lessonTitle = items.find(item => item.lesson?.id === filters.lessonId)?.lesson?.title;
  const studentLabel =
    filters.submitterEmail ??
    (filters.submitterUid &&
      (items.find(item => item.submitter.uid === filters.submitterUid)?.submitter.displayName || filters.submitterUid));

  return (
    <AdminPage>
      <AdminPageHeader
        title="Feedback"
        description="Bug reports, ideas and comments from students."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex self-start rounded-lg border border-border bg-white p-1 shadow-sm" aria-label="Status">
            {STATUS_TABS.map(tab => {
              const active = filters.status === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => navigate({ status: tab.value === 'unresolved' ? null : tab.value })}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-roman-stone hover:text-foreground'
                  )}>
                  {tab.label}
                  {tab.value === 'unresolved' && count.data !== undefined && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-xs font-semibold',
                        active ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                      )}>
                      {count.data.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-roman-stone">
              <Switch
                checked={filters.archived === 'true'}
                onCheckedChange={checked => navigate({ archived: checked ? 'true' : null })}
              />
              Archived
            </label>
            <Select value={filters.sort} onValueChange={value => navigate({ sort: value === 'oldest' ? 'oldest' : null })}>
              <SelectTrigger aria-label="Sort" className="w-36 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)]">
            <form onSubmit={applySearch}>
              <AdminSearchInput
                value={search}
                onValueChange={setSearch}
                label="Find by student email, student UID or report ID"
                placeholder="Student email, UID or report ID…"
              />
            </form>
            <FilterSelect
              label="Type"
              anyLabel="Any type"
              value={filters.type}
              options={FEEDBACK_TYPES}
              labels={FEEDBACK_TYPE_LABELS}
              onChange={value => navigate({ type: value, severity: value && value !== 'bug_report' ? null : (filters.severity ?? null) })}
            />
            <FilterSelect
              label="Severity"
              anyLabel="Any severity"
              value={filters.severity}
              options={FEEDBACK_SEVERITIES}
              labels={FEEDBACK_SEVERITY_LABELS}
              onChange={value => navigate({ severity: value })}
            />
            <FilterSelect
              label="Area"
              anyLabel="Any area"
              value={filters.area}
              options={FEEDBACK_AREAS}
              labels={FEEDBACK_AREA_LABELS}
              onChange={value => navigate({ area: value })}
            />
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="Submitted from"
                className="min-w-0 bg-white"
                value={params.get('from') ?? ''}
                onChange={event => navigate({ from: event.target.value || null })}
              />
              <span className="text-sm text-roman-stone">to</span>
              <Input
                type="date"
                aria-label="Submitted to"
                className="min-w-0 bg-white"
                value={params.get('to') ?? ''}
                onChange={event => navigate({ to: event.target.value || null })}
              />
            </div>
          </div>
          {hasFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {filters.submitterEmail || filters.submitterUid ? (
                <FilterChip
                  label={<>Student: {studentLabel}</>}
                  onRemove={() => navigate({ submitterEmail: null, submitterUid: null })}
                />
              ) : null}
              {filters.lessonId && (
                <FilterChip
                  label={
                    <span className="inline-flex items-center gap-1">
                      Lesson:{' '}
                      {lessonTitle ? <SimpleRichDisplay content={lessonTitle} className="inline text-xs [&_p]:inline" /> : filters.lessonId}
                    </span>
                  }
                  onRemove={() => navigate({ lessonId: null })}
                />
              )}
              <button
                type="button"
                className="ml-auto text-xs font-medium text-primary hover:underline"
                onClick={() => navigate(Object.fromEntries(FILTER_KEYS.map(key => [key, null])))}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <AdminLoadingState label="Loading feedback" />
      ) : isError ? (
        <AdminErrorState message={getApiErrorMessage(error, 'Could not load feedback.')} onRetry={refresh} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white/60">
          <AdminEmptyState
            icon={Inbox}
            title={hasFilters ? 'No matching feedback' : filters.status === 'unresolved' ? 'All caught up' : 'No feedback here yet'}
            description={
              hasFilters
                ? 'Try removing a filter or widening the dates.'
                : filters.status === 'unresolved'
                  ? 'There are no open reports. New student feedback will appear here.'
                  : 'Reports will appear here once students send them.'
            }
          />
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map(item => (
              <FeedbackRow
                key={item.id}
                item={item}
                href={`/admin/feedback/${encodeURIComponent(item.id)}?return=${encodeURIComponent(returnHref)}`}
              />
            ))}
          </ul>
          <div className="mt-6 flex flex-col items-center gap-2">
            {currentData?.nextCursor ? (
              <Button
                type="button"
                variant="outline"
                disabled={isFetching}
                onClick={() => setPaging({ key: queryString, cursor: currentData.nextCursor })}>
                {isFetching ? 'Loading…' : 'Load more'}
              </Button>
            ) : (
              <p className="text-xs text-roman-stone">
                Showing all {items.length} {items.length === 1 ? 'report' : 'reports'}
              </p>
            )}
          </div>
        </>
      )}
    </AdminPage>
  );
}

export const ProtectedFeedbackList = withAdminAuth(FeedbackList);
