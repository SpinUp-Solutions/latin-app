'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Eye, FileCheck2, Layers3, Loader2, Search, Users } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { useGetLearningPathQuery } from '@/src/store/api/lessonApi';
import { useGetMocksQuery } from '@/src/store/api/mockTestApi';
import { useGetTestsQuery } from '@/src/store/api/testApi';

type Filter = 'all' | 'normal' | 'mock' | 'in-path' | 'unplaced' | 'live-mocks' | 'archived-mocks';
const filters: Array<[Filter, string]> = [
  ['all', 'All'],
  ['normal', 'Normal tests'],
  ['mock', 'Mock tests'],
  ['in-path', 'In Learning Path'],
  ['unplaced', 'Unplaced'],
  ['live-mocks', 'Live mocks'],
  ['archived-mocks', 'Archived mocks'],
];

export function TestManager() {
  const { data: tests = [], isLoading: loadingTests, isError: testsError, refetch: refetchTests } = useGetTestsQuery();
  const { data: mocks = [], isLoading: loadingMocks, isError: mocksError, refetch: refetchMocks } = useGetMocksQuery();
  const { data: path, isLoading: loadingPath, isError: pathError, refetch: refetchPath } = useGetLearningPathQuery();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [query, setQuery] = React.useState('');
  const pathIds = new Set(path?.effectiveUnitIds ?? []);
  const items = [
    ...tests.map(test => ({
      kind: 'normal' as const,
      id: test.id,
      title: test.title,
      description: test.description,
      test,
      inPath: pathIds.has(test.id),
      activeMockCount: mocks.filter(
        mock => mock.status === 'active' && mock.parent.kind === 'test' && mock.parent.testId === test.id
      ).length,
      updatedAt: test.updatedAt,
    })),
    ...mocks.map(mock => ({
      kind: 'mock' as const,
      id: mock.id,
      title: mock.title,
      description: mock.description,
      mock,
      updatedAt: mock.updatedAt,
    })),
  ].filter(item => {
    const haystack = `${item.title} ${item.description}`.toLowerCase();
    if (!haystack.includes(query.toLowerCase())) return false;
    if (filter === 'all') return true;
    if (filter === 'normal') return item.kind === 'normal';
    if (filter === 'mock') return item.kind === 'mock';
    if (filter === 'in-path') return item.kind === 'normal' && item.inPath;
    if (filter === 'unplaced') return item.kind === 'normal' && !item.inPath;
    if (filter === 'live-mocks') return item.kind === 'mock' && item.mock.status === 'active' && item.mock.isLive;
    return item.kind === 'mock' && item.mock.status === 'archived';
  });
  if (loadingTests || loadingMocks || loadingPath)
    return (
      <div className="flex justify-center p-12" role="status">
        <Loader2 className="h-7 w-7 animate-spin" />
        <span className="sr-only">Loading test inventory and Learning Path placement</span>
      </div>
    );
  if (testsError || mocksError || pathError || !path)
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-6 text-red-700">
        <p>Unable to load the test inventory and canonical Learning Path placement.</p>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={() => {
            void refetchTests();
            void refetchMocks();
            void refetchPath();
          }}>
          Retry loading inventory
        </Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
          <Input
            aria-label="Search tests"
            className="pl-9"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search tests and mock cards"
          />
        </div>
        <div
          className="flex w-full gap-1.5 overflow-x-auto rounded-xl border border-border/80 bg-white/80 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Inventory filters">
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
      </div>
      {items.length ? (
        <div className="space-y-3">
          {items.map(item => (
            <Card
              key={`${item.kind}-${item.id}`}
              className={`overflow-hidden transition-shadow hover:shadow-md ${
                item.kind === 'mock' ? 'border-roman-gold/35' : ''
              }`}>
              <CardContent className="p-0">
                <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="gap-1.5 border-roman-gold/45 bg-roman-gold/[0.12] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-foreground">
                        <FileCheck2 className="h-3.5 w-3.5 text-roman-gold" aria-hidden="true" />
                        {item.kind === 'normal' ? 'Normal test' : 'Mock test'}
                      </Badge>
                      <span className="text-xs font-medium text-roman-stone" aria-hidden="true">
                        /
                      </span>
                      <span className="text-sm font-medium text-roman-stone">
                        {item.kind === 'normal'
                          ? item.inPath
                            ? 'In Learning Path'
                            : 'Unplaced'
                          : item.mock.status === 'archived'
                            ? item.mock.parent.kind === 'test'
                              ? 'Assignment ended — back in parent rotation'
                              : 'Archived standalone — version may be unowned or in normal rotation'
                            : item.mock.isLive
                              ? 'Live to students'
                              : 'Hidden from students (still mock-only)'}
                      </span>
                    </div>

                    <h2 className="break-words font-serif text-2xl leading-tight tracking-tight text-foreground sm:text-[1.7rem]">
                      {item.title}
                    </h2>
                    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {item.description || 'No description yet'}
                    </p>
                  </div>

                  <Button asChild size="sm" className="shrink-0 self-start">
                    <Link
                      href={item.kind === 'normal' ? `/admin/tests/edit/${item.id}` : `/admin/mock-tests/${item.id}`}>
                      <Eye className="mr-1.5 h-4 w-4" />
                      Manage
                      <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>

                <div className="grid border-t bg-muted/30 sm:grid-cols-2 lg:grid-cols-4">
                  {item.kind === 'normal' ? (
                    <>
                      <div className="flex items-center gap-3 border-b px-5 py-4 sm:border-r lg:border-b-0">
                        <Layers3 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
                            Versions
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {item.test.rotationVersionCount}{' '}
                            {item.test.rotationVersionCount === 1 ? 'rotation version' : 'rotation versions'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 border-b px-5 py-4 lg:border-b-0 lg:border-r">
                        <FileCheck2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
                            Points
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {item.test.minTotalPoints}–{item.test.maxTotalPoints}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 border-b px-5 py-4 sm:border-r lg:border-b-0">
                        <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
                            Linked mocks
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {item.activeMockCount} active linked {item.activeMockCount === 1 ? 'mock' : 'mocks'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-5 py-4">
                        <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
                            Requirement
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {item.test.passingPercentage === null
                              ? 'Score only'
                              : `Pass ≥ ${item.test.passingPercentage}%`}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 border-b px-5 py-4 sm:border-r lg:border-b-0">
                        <Layers3 className="h-4 w-4 shrink-0 text-roman-gold" aria-hidden="true" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
                            Version
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">One version</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 border-b px-5 py-4 lg:border-b-0 lg:border-r">
                        <FileCheck2 className="h-4 w-4 shrink-0 text-roman-gold" aria-hidden="true" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
                            Points
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">{item.mock.totalPoints}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 border-b px-5 py-4 sm:border-r lg:border-b-0">
                        <Users className="h-4 w-4 shrink-0 text-roman-gold" aria-hidden="true" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
                            Visibility
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {item.mock.isLive ? 'Live to students' : 'Hidden from students'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-5 py-4">
                        <CalendarDays className="h-4 w-4 shrink-0 text-roman-gold" aria-hidden="true" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-roman-stone">
                            Requirement
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">
                            {item.mock.passingPercentage === null
                              ? 'Score only'
                              : `Pass ≥ ${item.mock.passingPercentage}%`}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t px-5 py-3 text-xs text-roman-stone sm:px-6">
                  Last edited {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : 'unknown'}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-10 text-center text-gray-500">
            <FileCheck2 className="mx-auto mb-2 h-7 w-7" />
            No tests match this view.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
