'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Eye, FileCheck2, Layers3, Users } from 'lucide-react';
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminMetric,
  AdminSearchInput,
} from '@/src/components/admin/shell';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { useGetLearningPathQuery } from '@/src/store/api/lessonApi';
import { useGetMocksQuery } from '@/src/store/api/mockTestApi';
import { useGetTestsQuery } from '@/src/store/api/testApi';
import type { TestUnitSummary } from '@/src/types/test';

type Filter = 'all' | 'in-path' | 'unplaced';

interface TestInventoryItem {
  test: TestUnitSummary;
  inPath: boolean;
  activeMockCount: number;
}

const filters: Array<[Filter, string]> = [
  ['all', 'All tests'],
  ['in-path', 'In Learning Path'],
  ['unplaced', 'Unplaced'],
];

function formatPointsRange(minimum: number, maximum: number) {
  return minimum === maximum ? String(minimum) : `${minimum}–${maximum}`;
}

function TestCard({ item }: { item: TestInventoryItem }) {
  const { test, inPath, activeMockCount } = item;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1.5 border-roman-gold/45 bg-roman-gold/[0.12] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-foreground">
                <FileCheck2 className="h-3.5 w-3.5 text-roman-gold" aria-hidden="true" />
                Test
              </Badge>
              <span className="text-xs font-medium text-roman-stone" aria-hidden="true">
                /
              </span>
              <span className="text-sm font-medium text-roman-stone">{inPath ? 'In Learning Path' : 'Unplaced'}</span>
            </div>

            <h2 className="break-words font-serif text-2xl leading-tight tracking-tight text-foreground sm:text-[1.7rem]">
              {test.title}
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {test.description || 'No description yet'}
            </p>
          </div>

          <Button asChild size="sm" className="shrink-0 self-start">
            <Link href={`/admin/tests/edit/${test.id}`}>
              <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Manage
              <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="grid border-t bg-muted/30 sm:grid-cols-2 lg:grid-cols-4">
          <AdminMetric
            icon={Layers3}
            label="Versions"
            value={`${test.rotationVersionCount} ${
              test.rotationVersionCount === 1 ? 'active version' : 'active versions'
            }`}
            className="border-b sm:border-r lg:border-b-0"
          />
          <AdminMetric
            icon={FileCheck2}
            label="Points"
            value={formatPointsRange(test.minTotalPoints, test.maxTotalPoints)}
            className="border-b lg:border-b-0 lg:border-r"
          />
          <AdminMetric
            icon={Users}
            label="Linked mocks"
            value={`${activeMockCount} active ${activeMockCount === 1 ? 'mock' : 'mocks'}`}
            className="border-b sm:border-r lg:border-b-0"
          />
          <AdminMetric
            icon={CalendarDays}
            label="Requirement"
            value={test.passingPercentage === null ? 'Score only' : `Pass ≥ ${test.passingPercentage}%`}
          />
        </div>

        <div className="border-t px-5 py-3 text-xs text-roman-stone sm:px-6">
          Last edited {test.updatedAt ? new Date(test.updatedAt).toLocaleDateString() : 'unknown'}
        </div>
      </CardContent>
    </Card>
  );
}

export function TestManager() {
  const { data: tests = [], isLoading: loadingTests, isError: testsError, refetch: refetchTests } = useGetTestsQuery();
  const { data: mocks = [], isLoading: loadingMocks, isError: mocksError, refetch: refetchMocks } = useGetMocksQuery();
  const { data: path, isLoading: loadingPath, isError: pathError, refetch: refetchPath } = useGetLearningPathQuery();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [query, setQuery] = React.useState('');

  const inventory = React.useMemo<TestInventoryItem[]>(() => {
    const pathIds = new Set(path?.effectiveUnitIds ?? []);
    const activeMockCounts = new Map<string, number>();

    for (const mock of mocks) {
      if (mock.status !== 'active' || mock.parent.kind !== 'test') continue;
      activeMockCounts.set(mock.parent.testId, (activeMockCounts.get(mock.parent.testId) ?? 0) + 1);
    }

    return tests.map(test => ({
      test,
      inPath: pathIds.has(test.id),
      activeMockCount: activeMockCounts.get(test.id) ?? 0,
    }));
  }, [mocks, path?.effectiveUnitIds, tests]);

  const visibleItems = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return inventory.filter(item => {
      if (filter === 'in-path' && !item.inPath) return false;
      if (filter === 'unplaced' && item.inPath) return false;
      if (!normalizedQuery) return true;
      return `${item.test.title} ${item.test.description}`.toLocaleLowerCase().includes(normalizedQuery);
    });
  }, [filter, inventory, query]);

  const resetView = () => {
    setQuery('');
    setFilter('all');
  };

  if (loadingTests || loadingMocks || loadingPath)
    return <AdminLoadingState label="Loading test inventory and Learning Path placement" />;
  if (testsError || mocksError || pathError || !path)
    return (
      <AdminErrorState
        message="Unable to load the test inventory and canonical Learning Path placement."
        retryLabel="Retry loading inventory"
        onRetry={() => {
          void refetchTests();
          void refetchMocks();
          void refetchPath();
        }}
      />
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <AdminSearchInput
          value={query}
          onValueChange={setQuery}
          label="Search tests"
          clearLabel="Clear test search"
          placeholder="Search tests by title or description"
          className="max-w-lg"
        />
        <div
          className="flex w-full gap-1.5 overflow-x-auto rounded-xl border border-border/80 bg-white/80 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Test filters">
          {filters.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? 'default' : 'ghost'}
              aria-pressed={filter === value}
              className={
                filter === value
                  ? 'h-9 shrink-0 rounded-lg px-3.5 text-xs font-semibold shadow-[0_2px_6px_hsl(var(--primary)/0.22)]'
                  : 'h-9 shrink-0 rounded-lg px-3.5 text-xs font-medium text-roman-stone hover:bg-roman-parchment hover:text-foreground'
              }
              onClick={() => setFilter(value)}>
              {label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-roman-stone" role="status" aria-live="polite">
          Showing {visibleItems.length} of {inventory.length} {inventory.length === 1 ? 'test' : 'tests'}
        </p>
      </div>

      {visibleItems.length ? (
        <div className="space-y-3">
          {visibleItems.map(item => (
            <TestCard key={item.test.id} item={item} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={FileCheck2}
              title={inventory.length ? 'No tests match this view' : 'No tests yet'}
              description={
                inventory.length
                  ? 'Try another search or reset the placement filter.'
                  : 'Create a test to add the first assessment.'
              }
              action={
                inventory.length ? (
                  <Button type="button" variant="outline" onClick={resetView}>
                    Reset view
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
