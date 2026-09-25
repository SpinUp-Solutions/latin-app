'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import {
  FEEDBACK_AREAS,
  FEEDBACK_AREA_LABELS,
  FEEDBACK_SEVERITIES,
  FEEDBACK_TYPES,
  type FeedbackAdminListQuery,
} from '@/shared/student-feedback';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useGetAdminFeedbackCountQuery, useGetAdminFeedbackListQuery, type FeedbackListArgs } from '@/src/store/api/studentFeedbackApi';
import { refreshFeedbackListPageOne } from '@/src/store/api/studentFeedbackApi';
import { useAppDispatch } from '@/src/store/hooks';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

const TYPE_LABELS = { bug_report: 'Bug report', feature_suggestion: 'Feature suggestion', general: 'General feedback' } as const;
const SEVERITY_LABELS = { blocking: 'Blocking', major: 'Major', minor: 'Minor' } as const;
const QUERY_KEYS = ['status', 'archived', 'type', 'severity', 'area', 'lessonId', 'from', 'to', 'submitterUid', 'submitterEmail', 'feedbackId', 'sort'] as const;
const dateForInput = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const isoForDate = (date: string, end = false) => {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0).toISOString();
};

export function FeedbackList() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const [cursor, setCursor] = useState<string | null>(null);
  const queryString = searchParams.toString();
  const [textFilters, setTextFilters] = useState(() => ({ lessonId: searchParams.get('lessonId') ?? '', submitterEmail: searchParams.get('submitterEmail') ?? '', submitterUid: searchParams.get('submitterUid') ?? '', feedbackId: searchParams.get('feedbackId') ?? '' }));
  useEffect(() => setCursor(null), [queryString]);
  useEffect(() => {
    const current = new URLSearchParams(queryString);
    setTextFilters({ lessonId: current.get('lessonId') ?? '', submitterEmail: current.get('submitterEmail') ?? '', submitterUid: current.get('submitterUid') ?? '', feedbackId: current.get('feedbackId') ?? '' });
  }, [queryString]);
  const filters: FeedbackListArgs = {
    status: searchParams.get('status') === 'resolved' ? 'resolved' : searchParams.get('status') === 'all' ? 'all' : 'unresolved',
    archived: searchParams.get('archived') === 'true' ? 'true' : 'false',
    sort: searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest',
  };
  for (const key of QUERY_KEYS) {
    if (key === 'status' || key === 'archived' || key === 'sort') continue;
    const value = searchParams.get(key);
    if (value) (filters as Record<string, string>)[key] = value;
  }
  const args = { ...filters, cursor };
  const { currentData, isLoading, isFetching, isError, error } = useGetAdminFeedbackListQuery(args);
  const count = useGetAdminFeedbackCountQuery(undefined, { refetchOnFocus: true });
  const changeFilter = (key: keyof FeedbackAdminListQuery, value: string) => {
    const next = new URLSearchParams(queryString);
    if (value) next.set(key, value);
    else next.delete(key);
    setCursor(null);
    router.replace(`/admin/feedback${next.toString() ? `?${next}` : ''}`);
  };
  const applyTextFilters = () => {
    const next = new URLSearchParams(queryString);
    for (const [key, value] of Object.entries(textFilters)) {
      if (value.trim()) next.set(key, value.trim()); else next.delete(key);
    }
    setCursor(null);
    router.replace(`/admin/feedback${next.toString() ? `?${next}` : ''}`);
  };
  const refresh = () => {
    setCursor(null);
    void refreshFeedbackListPageOne(dispatch, args);
    void count.refetch();
  };
  const returnHref = `/admin/feedback${queryString ? `?${queryString}` : ''}`;
  const items = currentData?.items ?? [];

  return <AdminPage>
    <AdminPageHeader title="Feedback" description="Review student reports, add private notes, and track resolution." actions={<Button type="button" variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} />
    <div className="mb-5 grid gap-3 rounded-xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Status<select className="mt-1 w-full rounded-md border border-border bg-white p-2" value={filters.status} onChange={event => changeFilter('status', event.target.value)}><option value="unresolved">Unresolved</option><option value="resolved">Resolved</option><option value="all">All</option></select></label>
      <label className="text-sm">Archive<select className="mt-1 w-full rounded-md border border-border bg-white p-2" value={filters.archived} onChange={event => changeFilter('archived', event.target.value)}><option value="false">Active</option><option value="true">Archived</option></select></label>
      <label className="text-sm">Type<select className="mt-1 w-full rounded-md border border-border bg-white p-2" value={filters.type ?? ''} onChange={event => changeFilter('type', event.target.value)}><option value="">All types</option>{FEEDBACK_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select></label>
      <label className="text-sm">Severity<select className="mt-1 w-full rounded-md border border-border bg-white p-2" value={filters.severity ?? ''} onChange={event => changeFilter('severity', event.target.value)}><option value="">All severities</option>{FEEDBACK_SEVERITIES.map(severity => <option key={severity} value={severity}>{SEVERITY_LABELS[severity]}</option>)}</select></label>
      <label className="text-sm">Area<select className="mt-1 w-full rounded-md border border-border bg-white p-2" value={filters.area ?? ''} onChange={event => changeFilter('area', event.target.value)}><option value="">All areas</option>{FEEDBACK_AREAS.map(area => <option key={area} value={area}>{FEEDBACK_AREA_LABELS[area]}</option>)}</select></label>
      <label className="text-sm">Lesson ID<input className="mt-1 w-full rounded-md border border-border p-2" value={textFilters.lessonId} onChange={event => setTextFilters(current => ({ ...current, lessonId: event.target.value }))} placeholder="Exact lesson ID" /></label>
      <label className="text-sm">From (your time)<input type="date" className="mt-1 w-full rounded-md border border-border p-2" value={dateForInput(filters.from)} onChange={event => changeFilter('from', isoForDate(event.target.value))} /></label>
      <label className="text-sm">To (your time)<input type="date" className="mt-1 w-full rounded-md border border-border p-2" value={dateForInput(filters.to)} onChange={event => changeFilter('to', isoForDate(event.target.value, true))} /></label>
      <label className="text-sm">Exact submitter email<input type="search" className="mt-1 w-full rounded-md border border-border p-2" value={textFilters.submitterEmail} onChange={event => setTextFilters(current => ({ ...current, submitterEmail: event.target.value }))} /></label>
      <label className="text-sm">Submitter UID<input type="search" className="mt-1 w-full rounded-md border border-border p-2" value={textFilters.submitterUid} onChange={event => setTextFilters(current => ({ ...current, submitterUid: event.target.value }))} /></label>
      <label className="text-sm">Feedback ID<input type="search" className="mt-1 w-full rounded-md border border-border p-2" value={textFilters.feedbackId} onChange={event => setTextFilters(current => ({ ...current, feedbackId: event.target.value }))} /></label>
      <label className="text-sm">Sort<select className="mt-1 w-full rounded-md border border-border bg-white p-2" value={filters.sort} onChange={event => changeFilter('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      <div className="flex items-end gap-2"><Button type="button" onClick={applyTextFilters}>Apply search</Button><Button type="button" variant="outline" onClick={() => { setTextFilters({ lessonId: '', submitterEmail: '', submitterUid: '', feedbackId: '' }); router.replace('/admin/feedback'); }}>Reset</Button></div>
    </div>
    <p className="mb-3 text-sm text-roman-stone">{count.data ? `${count.data.count} unresolved active reports` : 'Feedback reports'} · 25 per page</p>
    {isLoading && <p role="status">Loading feedback…</p>}
    {isError && <div role="alert" className="rounded-md border border-destructive/30 bg-white p-4"><p>{getApiErrorMessage(error, 'Could not load feedback.')}</p><Button type="button" variant="outline" className="mt-3" onClick={refresh}>Retry</Button></div>}
    {!isLoading && !isError && items.length === 0 && <div className="rounded-xl border border-border bg-white p-8 text-center text-roman-stone">{queryString ? 'No reports match these filters.' : 'No unresolved reports.'}</div>}
    {items.length > 0 && <div className="space-y-3">{items.map(item => <Link key={item.id} href={`/admin/feedback/${encodeURIComponent(item.id)}?return=${encodeURIComponent(returnHref)}`} className="block rounded-xl border border-border bg-white p-4 transition-colors hover:border-primary/40 hover:bg-roman-parchment/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="font-medium text-roman-red">{TYPE_LABELS[item.type]} <span className="ml-2 text-xs font-normal text-roman-stone">{item.status}{item.archived ? ' · archived' : ''}</span></div><time className="text-xs text-roman-stone" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>
      <p className="mt-1 text-sm text-roman-stone">{item.submitter.displayName || item.submitter.email || item.submitter.uid}{item.submitter.email ? ` · ${item.submitter.email}` : ''}</p>
      {item.lesson && <div className="mt-1 text-sm">Lesson: <SimpleRichDisplay content={item.lesson.title} className="inline" /></div>}
      <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm">{item.description}</p>
      <p className="mt-2 text-xs text-roman-stone">{item.attachments.length} attachment{item.attachments.length === 1 ? '' : 's'} · {item.id}</p>
    </Link>)}</div>}
    {currentData?.nextCursor && <div className="mt-5 text-center"><Button type="button" variant="outline" disabled={isFetching} onClick={() => setCursor(currentData.nextCursor)}>{isFetching ? 'Loading…' : 'Load more'}</Button></div>}
  </AdminPage>;
}

export const ProtectedFeedbackList = withAdminAuth(FeedbackList);
