'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, PackageOpen } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
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
  return (
    <Card className={mock.status === 'archived' ? 'border-border bg-roman-marble/70' : 'border-roman-gold/35'}>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-roman-gold/35 bg-roman-gold/15 px-2.5 py-1 text-xs font-semibold leading-none text-foreground shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
              MOCK TEST
            </span>
            <span className="text-xs text-gray-600">{state(mock)}</span>
          </div>
          <h2 className="font-serif text-lg">{mock.title}</h2>
          <p className="text-sm text-gray-500">{mock.description || 'No description'}</p>
          <p className="mt-2 text-xs text-gray-600">
            One version · {mock.totalPoints} points ·{' '}
            {mock.passingPercentage === null ? 'Score only' : `Pass ≥ ${mock.passingPercentage}%`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onMove !== undefined && index !== undefined && count !== undefined && (
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
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/mock-tests/${mock.id}`}>
              {mock.isLive ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}Manage
            </Link>
          </Button>
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
  if (isLoading)
    return (
      <div className="flex justify-center p-12" role="status">
        <Loader2 className="h-7 w-7 animate-spin" />
        <span className="sr-only">Loading mock tests</span>
      </div>
    );
  if (isError)
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-6 text-red-700">
        Unable to load mock tests. Refresh and try again.
      </div>
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
