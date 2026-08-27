'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  Eye,
  EyeOff,
  Layers3,
  Link2,
  PackageOpen,
} from 'lucide-react';
import { AdminErrorState, AdminLoadingState, AdminMetric } from '@/src/components/admin/shell';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { useGetMocksQuery, useReorderMocksMutation } from '@/src/store/api/mockTestApi';
import type { MockTestSummary } from '@/src/types/test';

function state(mock: MockTestSummary) {
  if (mock.status === 'archived')
    return mock.parent.kind === 'test' ? 'Assignment ended — back in rotation' : 'Assignment ended';
  return mock.isLive ? 'Live to students' : 'Hidden from students (still mock-only)';
}

function MockCard({
  mock,
  index,
  count,
  onMove,
  reorderPending = false,
}: {
  mock: MockTestSummary;
  index?: number;
  count?: number;
  onMove?: (from: number, to: number) => void;
  reorderPending?: boolean;
}) {
  const canReorder = onMove !== undefined && index !== undefined && count !== undefined;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1.5 border-roman-gold/45 bg-roman-gold/[0.12] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-foreground">
                <ClipboardCheck className="h-3.5 w-3.5 text-roman-gold" aria-hidden="true" />
                Mock test
              </Badge>
              <span className="text-xs font-medium text-roman-stone" aria-hidden="true">
                /
              </span>
              <span className="text-sm font-medium text-roman-stone">{state(mock)}</span>
            </div>

            <h2 className="break-words font-serif text-2xl leading-tight tracking-tight text-foreground sm:text-[1.7rem]">
              <SimpleRichDisplay content={mock.title} />
            </h2>
            <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              <SimpleRichDisplay content={mock.description || 'No description yet'} />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
            {canReorder && (
              <>
                <Button
                  aria-label={`Move ${mock.title} up`}
                  size="icon"
                  variant="outline"
                  disabled={reorderPending || index === 0}
                  onClick={() => onMove(index, index - 1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={`Move ${mock.title} down`}
                  size="icon"
                  variant="outline"
                  disabled={reorderPending || index === count - 1}
                  onClick={() => onMove(index, index + 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button asChild size="sm" className="shrink-0">
              <Link href={`/admin/mock-tests/${mock.id}`}>
                {mock.isLive ? (
                  <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />
                ) : (
                  <EyeOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                Manage
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid border-t bg-muted/30 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetric
            icon={Layers3}
            label="Versions"
            value="1 version"
            className="border-b sm:border-r lg:border-b-0"
          />
          <AdminMetric
            icon={ClipboardCheck}
            label="Points"
            value={mock.totalPoints}
            className="border-b lg:border-b-0 lg:border-r"
          />
          <AdminMetric
            icon={Link2}
            label="Source"
            value={mock.parent.kind === 'test' ? 'Assigned from a test' : 'Standalone'}
            className="border-b sm:border-r lg:border-b-0"
          />
          <AdminMetric
            icon={CalendarDays}
            label="Requirement"
            value={mock.passingPercentage === null ? 'Score only' : `Pass ≥ ${mock.passingPercentage}%`}
          />
        </div>

        <div className="border-t px-5 py-3 text-xs text-roman-stone sm:px-6">
          Last edited {mock.updatedAt ? new Date(mock.updatedAt).toLocaleDateString() : 'unknown'}
        </div>
      </CardContent>
    </Card>
  );
}

export function MockTestManager() {
  const { data: mocks = [], isLoading, isError, refetch } = useGetMocksQuery();
  const [reorder, { isLoading: isReordering }] = useReorderMocksMutation();
  const reorderInFlight = useRef(false);
  const [reorderPending, setReorderPending] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const live = mocks
    .filter(mock => mock.status === 'active' && mock.isLive)
    .sort((a, b) => (a.mockOrder ?? 0) - (b.mockOrder ?? 0));
  const hidden = mocks.filter(mock => mock.status === 'active' && !mock.isLive);
  const archived = mocks.filter(mock => mock.status === 'archived');
  const move = async (from: number, to: number) => {
    if (reorderInFlight.current || refreshFailed) return;
    reorderInFlight.current = true;
    setReorderPending(true);
    setReorderError(null);
    const ids = live.map(mock => mock.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    let persisted = false;
    try {
      await reorder({ mockIds: ids }).unwrap();
      persisted = true;
      await refetch().unwrap();
    } catch {
      try {
        await refetch().unwrap();
        setReorderError(
          persisted
            ? 'The order was saved and has now been refreshed.'
            : 'The order could not be saved. The current order has been restored; try again.'
        );
      } catch {
        setRefreshFailed(true);
        setReorderError('The order could not be refreshed. Reload this page before changing the order.');
      }
    } finally {
      reorderInFlight.current = false;
      setReorderPending(false);
    }
  };
  if (isLoading) return <AdminLoadingState label="Loading mock tests" />;
  if (isError)
    return (
      <AdminErrorState
        message="Unable to load mock tests."
        retryLabel="Retry loading mock tests"
        onRetry={() => void refetch()}
      />
    );
  if (!mocks.length)
    return (
      <Card>
        <CardContent className="p-10 text-center text-gray-500">
          <PackageOpen className="mx-auto mb-3 h-8 w-8" />
          No mock tests yet. Create a standalone mock or assign a normal-test version.
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-8">
      {reorderError && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {reorderError}
        </p>
      )}
      <section aria-labelledby="live-mocks">
        <h2 id="live-mocks" className="mb-3 font-serif text-xl">
          Live mock cards
        </h2>
        <p className="mb-3 text-sm text-gray-500">
          This is the complete student-card order. Use the buttons to reorder it.
        </p>
        {(isReordering || reorderPending) && (
          <p className="text-sm" role="status">
            Saving order…
          </p>
        )}
        {live.length ? (
          <div className="space-y-3">
            {live.map((mock, index) => (
              <MockCard
                key={mock.id}
                mock={mock}
                index={index}
                count={live.length}
                reorderPending={isReordering || reorderPending || refreshFailed}
                onMove={(from, to) => void move(from, to)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded border border-dashed p-4 text-sm text-gray-500">No mock cards are live to students.</p>
        )}
      </section>
      <section aria-labelledby="hidden-mocks">
        <h2 id="hidden-mocks" className="mb-3 font-serif text-xl">
          Hidden mock-only cards
        </h2>
        {hidden.length ? (
          <div className="space-y-3">
            {hidden.map(mock => (
              <MockCard key={mock.id} mock={mock} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No hidden active mocks.</p>
        )}
      </section>
      <section aria-labelledby="archived-mocks">
        <h2 id="archived-mocks" className="mb-3 font-serif text-xl">
          Archived assignments
        </h2>
        {archived.length ? (
          <div className="space-y-3">
            {archived.map(mock => (
              <MockCard key={mock.id} mock={mock} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No archived mock assignments.</p>
        )}
      </section>
    </div>
  );
}
