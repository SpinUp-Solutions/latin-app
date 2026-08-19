'use client';

import React, { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Check, ClipboardCheck, Headphones, Layers3, Pencil, Search } from 'lucide-react';
import { Input } from '@/src/components/ui/input';
import { PracticeLessonCard, type PracticeCardTheme } from '@/src/components/ui/core/practice-lesson-card';
import { MockTestCard } from '@/src/components/ui/core/mock-test-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { cn } from '@/src/lib/utils';
import type { LessonWithProgress, StudentLessonSummary } from '@/src/types/lesson';
import type { PracticeCategorySummary, PracticeLessonType } from '@/src/types/practice-category';
import type { StudentMockTestSummary } from '@/src/types/test';
import type { StudentPastMockResult } from '@/src/types/test-results';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';
import { lessonMatchesTextSearch } from '@/src/utils/practiceCategoryLessons';
import { formatScorePercentage, formatScorePoints } from '@/src/lib/tests/formatting';

type PracticeTab = PracticeLessonType | 'mock-tests';
type PracticeTabConfig = PracticeCardTheme & {
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  activeSurface: string;
  emptyLabel: string;
  tagSelected: string;
  tagHover: string;
};

type PracticeLesson = LessonWithProgress | StudentLessonSummary;

interface PracticeSectionProps {
  lessons: PracticeLesson[];
  onLessonClick: (lessonId: string) => void;
  mockTests?: StudentMockTestSummary[];
  onMockTestClick?: (mockTestId: string) => void;
  /** Review-only entries for hidden/archived mocks with submitted attempts. */
  pastMockResults?: StudentPastMockResult[];
}

const tabOrder: PracticeTab[] = ['vocab', 'sentence-diagramming', 'listening', 'mock-tests'];

const tabConfig: Record<PracticeTab, PracticeTabConfig> = {
  vocab: {
    label: 'Vocabulary',
    shortLabel: 'Vocabulary',
    icon: BookOpen,
    activeSurface: 'border-amber-300 bg-amber-50 text-amber-950 shadow-sm',
    iconSurface: 'bg-amber-100',
    iconColor: 'text-amber-700',
    progress: 'bg-amber-500',
    glow: 'from-amber-300/35 via-amber-100/20 to-transparent',
    emptyLabel: 'No vocabulary practice is available yet.',
    tagSelected: 'border-amber-300 bg-amber-100 text-amber-950',
    tagHover: 'hover:border-amber-200 hover:bg-amber-50 hover:text-amber-900',
  },
  'sentence-diagramming': {
    label: 'Sentence Diagramming',
    shortLabel: 'Diagramming',
    icon: Pencil,
    activeSurface: 'border-sky-300 bg-sky-50 text-sky-950 shadow-sm',
    iconSurface: 'bg-sky-100',
    iconColor: 'text-sky-700',
    progress: 'bg-sky-500',
    glow: 'from-sky-300/35 via-sky-100/20 to-transparent',
    emptyLabel: 'No diagramming practice is available yet.',
    tagSelected: 'border-sky-300 bg-sky-100 text-sky-950',
    tagHover: 'hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900',
  },
  listening: {
    label: 'Listening',
    shortLabel: 'Listening',
    icon: Headphones,
    activeSurface: 'border-violet-300 bg-violet-50 text-violet-950 shadow-sm',
    iconSurface: 'bg-violet-100',
    iconColor: 'text-violet-700',
    progress: 'bg-violet-500',
    glow: 'from-violet-300/35 via-violet-100/20 to-transparent',
    emptyLabel: 'No listening practice is available yet.',
    tagSelected: 'border-violet-300 bg-violet-100 text-violet-950',
    tagHover: 'hover:border-violet-200 hover:bg-violet-50 hover:text-violet-900',
  },
  'mock-tests': {
    label: 'Mock Tests',
    shortLabel: 'Mock Tests',
    icon: ClipboardCheck,
    activeSurface: 'border-teal-300 bg-teal-50 text-teal-950 shadow-sm',
    iconSurface: 'bg-teal-100',
    iconColor: 'text-teal-700',
    progress: 'bg-teal-500',
    glow: 'from-teal-300/35 via-teal-100/20 to-transparent',
    emptyLabel: 'No mock tests are available yet.',
    tagSelected: 'border-teal-300 bg-teal-100 text-teal-950',
    tagHover: 'hover:border-teal-200 hover:bg-teal-50 hover:text-teal-900',
  },
};

const getDefaultTab = (
  lessons: PracticeLesson[],
  mockTests: StudentMockTestSummary[],
  pastMockResults: StudentPastMockResult[]
): PracticeTab =>
  tabOrder.find(type =>
    type === 'mock-tests'
      ? mockTests.length > 0 || pastMockResults.length > 0
      : lessons.some(lesson => lesson.type === type)
  ) ?? 'vocab';

const lessonHasCategory = (lesson: PracticeLesson, categoryId: string) =>
  lesson.practiceCategories?.some(category => category.status === 'active' && category.id === categoryId) ?? false;

const getCategoryLessonOrder = (lesson: PracticeLesson, categoryId: string) =>
  lesson.practiceCategoryPlacements?.find(placement => placement.categoryId === categoryId)?.lessonOrder ??
  Number.MAX_SAFE_INTEGER;

const getCategoryTagIds = (lesson: PracticeLesson, categoryId: string) =>
  lesson.practiceCategoryPlacements?.find(placement => placement.categoryId === categoryId)?.tagIds ?? [];

function CollectionOption({
  label,
  count,
  selected,
  activeSurface,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  activeSurface: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm font-medium text-slate-600 transition',
        'hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red',
        selected && activeSurface
      )}>
      <span className="line-clamp-2">{label}</span>
      <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs tabular-nums text-slate-500">{count}</span>
    </button>
  );
}

export const PracticeSection: React.FC<PracticeSectionProps> = ({
  lessons,
  onLessonClick,
  mockTests = [],
  onMockTestClick,
  pastMockResults = [],
}) => {
  const panelId = useId();
  const [activeTab, setActiveTab] = useState<PracticeTab>(() => getDefaultTab(lessons, mockTests, pastMockResults));
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const lessonsByType = useMemo(() => {
    const grouped: Record<PracticeLessonType, PracticeLesson[]> = {
      vocab: [],
      'sentence-diagramming': [],
      listening: [],
    };
    lessons.forEach(lesson => {
      if (lesson.type !== 'normal') grouped[lesson.type].push(lesson);
    });
    return grouped;
  }, [lessons]);

  const lessonCounts: Record<PracticeLessonType, number> = {
    vocab: lessonsByType.vocab.length,
    'sentence-diagramming': lessonsByType['sentence-diagramming'].length,
    listening: lessonsByType.listening.length,
  };
  const isMockTab = activeTab === 'mock-tests';
  const activeTypeLessons = useMemo(
    () => (isMockTab ? [] : lessonsByType[activeTab]),
    [activeTab, isMockTab, lessonsByType]
  );

  const { categories, categoryCounts } = useMemo(() => {
    const byId = new Map<string, PracticeCategorySummary>();
    const counts = new Map<string, number>();
    activeTypeLessons.forEach(lesson => {
      lesson.practiceCategories?.forEach(category => {
        if (isMockTab || category.status !== 'active' || category.lessonType !== activeTab) return;
        byId.set(category.id, category);
        counts.set(category.id, (counts.get(category.id) ?? 0) + 1);
      });
    });
    return {
      categories: [...byId.values()].sort(
        (left, right) => left.categoryOrder - right.categoryOrder || left.id.localeCompare(right.id)
      ),
      categoryCounts: counts,
    };
  }, [activeTab, activeTypeLessons, isMockTab]);

  const selectedCategory =
    selectedCategoryId === 'all' ? undefined : categories.find(category => category.id === selectedCategoryId);
  const activeCategoryId = selectedCategory?.id ?? 'all';

  const collectionLessons = useMemo(() => {
    if (activeCategoryId === 'all') return activeTypeLessons;
    return activeTypeLessons
      .filter(lesson => lessonHasCategory(lesson, activeCategoryId))
      .sort(
        (left, right) =>
          getCategoryLessonOrder(left, activeCategoryId) - getCategoryLessonOrder(right, activeCategoryId) ||
          left.id.localeCompare(right.id)
      );
  }, [activeCategoryId, activeTypeLessons]);

  const visibleTags = useMemo(() => {
    if (!selectedCategory) return [];
    const counts = new Map<string, number>();
    collectionLessons.forEach(lesson => {
      getCategoryTagIds(lesson, selectedCategory.id).forEach(tagId => {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      });
    });
    return (selectedCategory.tags ?? [])
      .filter(tag => tag.status === 'active' && (counts.get(tag.id) ?? 0) > 0)
      .sort((a, b) => a.tagOrder - b.tagOrder || a.id.localeCompare(b.id))
      .map(tag => ({ ...tag, lessonCount: counts.get(tag.id) ?? 0 }));
  }, [collectionLessons, selectedCategory]);

  const tagFilteredLessons = useMemo(() => {
    if (!selectedCategory || selectedTagIds.length === 0) return collectionLessons;
    return collectionLessons.filter(lesson =>
      getCategoryTagIds(lesson, selectedCategory.id).some(tagId => selectedTagIds.includes(tagId))
    );
  }, [collectionLessons, selectedCategory, selectedTagIds]);

  const visibleLessons = useMemo(
    () => tagFilteredLessons.filter(lesson => lessonMatchesTextSearch(lesson, searchQuery)),
    [searchQuery, tagFilteredLessons]
  );
  const visibleMockTests = useMemo(
    () => mockTests.filter(mock => lessonMatchesTextSearch(mock, searchQuery)),
    [mockTests, searchQuery]
  );
  const visiblePastMockResults = useMemo(
    () => pastMockResults.filter(mock => lessonMatchesTextSearch(mock, searchQuery)),
    [pastMockResults, searchQuery]
  );

  if (lessons.length === 0 && mockTests.length === 0 && pastMockResults.length === 0) return null;

  const config = tabConfig[activeTab];
  const ActiveIcon = config.icon;
  const collectionTitle = selectedCategory?.name ?? `All ${config.shortLabel} practice`;
  const collectionDescription =
    selectedCategory?.description ??
    `Browse every ${config.shortLabel.toLocaleLowerCase()} practice lesson in one place.`;
  const filtersActive = selectedTagIds.length > 0 || searchQuery.trim().length > 0;

  const selectTab = (tab: PracticeTab) => {
    setActiveTab(tab);
    setSelectedCategoryId('all');
    setSelectedTagIds([]);
    setSearchQuery('');
  };

  const selectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedTagIds([]);
    setSearchQuery('');
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(current =>
      current.includes(tagId) ? current.filter(currentId => currentId !== tagId) : [...current, tagId]
    );
  };

  const clearFilters = () => {
    setSelectedTagIds([]);
    setSearchQuery('');
  };

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-roman-red/15 bg-white/90 shadow-[0_28px_80px_-45px_rgba(76,30,35,0.5)] backdrop-blur-sm">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-roman-parchment via-roman-parchment/45 to-transparent"
      />
      <div aria-hidden="true" className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-roman-gold/10 blur-3xl" />

      <div className="relative border-b border-slate-200/70 px-4 pb-4 pt-6 sm:px-6 sm:pb-6 sm:pt-8 lg:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h3 className="text-3xl font-serif leading-tight text-slate-950 sm:text-4xl">Practice</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              Choose a practice type, then focus on a collection.
            </p>
          </div>

          <div className="w-full xl:max-w-4xl">
            <div
              className="grid w-full grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-white/75 p-1.5 shadow-sm sm:grid-cols-4"
              role="tablist"
              aria-label="Practice type">
              {tabOrder.map(tab => {
                const tabDetails = tabConfig[tab];
                const Icon = tabDetails.icon;
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    id={`${panelId}-${tab}-tab`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`${panelId}-panel`}
                    onClick={() => selectTab(tab)}
                    className={cn(
                      'flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-2 py-2 text-center text-xs font-semibold text-slate-600 transition sm:min-h-12 sm:flex-row sm:gap-2 sm:text-sm',
                      'hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2',
                      isActive && tabDetails.activeSurface
                    )}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{tabDetails.shortLabel}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums sm:text-xs',
                        isActive ? 'bg-white/80 text-current' : 'bg-slate-100 text-slate-500'
                      )}>
                      {tab === 'mock-tests' ? mockTests.length + pastMockResults.length : lessonCounts[tab]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        id={`${panelId}-panel`}
        role="tabpanel"
        aria-labelledby={`${panelId}-${activeTab}-tab`}
        className="relative lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        {isMockTab ? (
          <>
            <aside
              className="hidden border-r border-slate-200/80 bg-slate-50/60 p-5 lg:block"
              aria-label="Mock test information">
              <div className="mb-3 flex items-center gap-2 px-2">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    config.iconSurface,
                    config.iconColor
                  )}>
                  <ActiveIcon className="h-4 w-4" />
                </span>
                <span className="text-xl font-serif text-slate-950">Mock Tests</span>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-xl border border-teal-100 bg-white/70 px-3 py-2 text-xs font-medium text-slate-600">
                <span>Available</span>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 tabular-nums text-teal-800">
                  {mockTests.length}
                </span>
              </div>
            </aside>

            <div className="min-w-0 p-4 sm:p-6 lg:p-8">
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        config.iconSurface,
                        config.iconColor
                      )}>
                      <ActiveIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="truncate text-xl font-serif text-slate-950 sm:text-2xl">Mock Tests</h4>
                      <p className="text-xs font-medium text-slate-500">
                        {searchQuery.trim() ? `${visibleMockTests.length} of ${mockTests.length}` : mockTests.length}{' '}
                        {mockTests.length === 1 ? 'mock test' : 'mock tests'}
                      </p>
                    </div>
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    Practice under test conditions. Scores here never unlock or block your Learning Path.
                  </p>
                </div>

                <div className="relative w-full shrink-0 md:w-72">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    aria-label="Search Mock Tests"
                    placeholder="Search mock tests"
                    className="h-11 rounded-xl border-slate-200 bg-white pl-10 shadow-sm"
                  />
                </div>
              </div>

              {mockTests.length === 0 && pastMockResults.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-14 text-center">
                  <ActiveIcon className={cn('mx-auto mb-4 h-8 w-8', config.iconColor)} />
                  <h5 className="text-lg font-serif text-slate-800">Nothing here just yet</h5>
                  <p className="mt-1 text-sm text-slate-500">{config.emptyLabel}</p>
                </div>
              ) : visibleMockTests.length === 0 && visiblePastMockResults.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-14 text-center">
                  <Search className="mx-auto mb-4 h-8 w-8 text-slate-300" />
                  <h5 className="text-lg font-serif text-slate-800">No matching mock tests</h5>
                  <p className="mt-1 text-sm text-slate-500">Try another title or clear your search.</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-4 rounded-lg px-3 py-2 text-sm font-semibold text-roman-red hover:bg-roman-red/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red">
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="mock-test-grid">
                  {visibleMockTests.map(mock => (
                    <MockTestCard key={mock.id} mock={mock} onMockClick={onMockTestClick ?? (() => undefined)} />
                  ))}
                </div>
              )}

              {visiblePastMockResults.length > 0 ? (
                <div className="mt-8" data-testid="past-mock-results">
                  <h5 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Past mock results</h5>
                  <p className="mt-1 text-xs text-slate-500">
                    These mock tests are no longer available to take, but you can still review your latest result.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {visiblePastMockResults.map(mock => (
                      <li
                        key={mock.id}
                        data-testid={`past-mock-result-${mock.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800">{stripHtmlTags(mock.title)}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">
                            Latest: {formatScorePoints(mock.latest.score)} / {formatScorePoints(mock.latest.maxScore)} (
                            {formatScorePercentage(mock.latest.percentage)}%) ·{' '}
                            {mock.latest.outcome === 'passed'
                              ? 'passed'
                              : mock.latest.outcome === 'not-passed'
                                ? 'not passed'
                                : 'completed'}
                          </div>
                        </div>
                        <Link
                          className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-roman-red underline-offset-2 hover:bg-roman-red/5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red"
                          href={`/test-results/${mock.latest.attemptId}`}>
                          Review result
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <aside
              className="hidden border-r border-slate-200/80 bg-slate-50/60 p-5 lg:block"
              aria-label="Practice collections">
              <div className="mb-3 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                <Layers3 className="h-4 w-4" />
                Collections
              </div>
              <div className="space-y-1.5" role="radiogroup" aria-label={`${config.label} categories`}>
                <CollectionOption
                  label="All Practice"
                  count={activeTypeLessons.length}
                  selected={activeCategoryId === 'all'}
                  activeSurface={config.activeSurface}
                  onClick={() => selectCategory('all')}
                />
                {categories.map(category => (
                  <CollectionOption
                    key={category.id}
                    label={category.name}
                    count={categoryCounts.get(category.id) ?? 0}
                    selected={activeCategoryId === category.id}
                    activeSurface={config.activeSurface}
                    onClick={() => selectCategory(category.id)}
                  />
                ))}
              </div>
            </aside>

            <div className="min-w-0 p-4 sm:p-6 lg:p-8">
              <div className="mb-5 lg:hidden">
                <label
                  htmlFor={`${panelId}-category-select`}
                  className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Collection
                </label>
                <Select value={activeCategoryId} onValueChange={selectCategory}>
                  <SelectTrigger
                    id={`${panelId}-category-select`}
                    aria-label={`${config.label} category`}
                    className="h-12 rounded-xl border-slate-200 bg-white px-4 shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Practice ({activeTypeLessons.length})</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name} ({categoryCounts.get(category.id) ?? 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        config.iconSurface,
                        config.iconColor
                      )}>
                      <ActiveIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="truncate text-xl font-serif text-slate-950 sm:text-2xl">{collectionTitle}</h4>
                      <p className="text-xs font-medium text-slate-500">
                        {filtersActive
                          ? `${visibleLessons.length} of ${collectionLessons.length}`
                          : collectionLessons.length}{' '}
                        {collectionLessons.length === 1 ? 'lesson' : 'lessons'}
                      </p>
                    </div>
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">{stripHtmlTags(collectionDescription)}</p>
                </div>

                <div className="relative w-full shrink-0 md:w-72">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    aria-label={`Search ${collectionTitle}`}
                    placeholder="Search this collection"
                    className="h-11 rounded-xl border-slate-200 bg-white pl-10 shadow-sm"
                  />
                </div>
              </div>

              {selectedCategory && visibleTags.length > 0 && (
                <div
                  className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
                  role="group"
                  aria-label={`Filter ${selectedCategory.name} lessons by tag`}>
                  <button
                    type="button"
                    aria-pressed={selectedTagIds.length === 0}
                    aria-label={`Show all ${selectedCategory.name} lessons`}
                    onClick={() => setSelectedTagIds([])}
                    className={cn(
                      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2',
                      selectedTagIds.length === 0
                        ? config.tagSelected
                        : `border-slate-200 bg-white text-slate-600 ${config.tagHover}`
                    )}>
                    {selectedTagIds.length === 0 && <Check className="h-3.5 w-3.5" />}
                    All
                    <span className="tabular-nums opacity-70">{collectionLessons.length}</span>
                  </button>
                  {visibleTags.map(tag => {
                    const selected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2',
                          selected ? config.tagSelected : `border-slate-200 bg-white text-slate-600 ${config.tagHover}`
                        )}>
                        {selected && <Check className="h-3.5 w-3.5" />}
                        {tag.name}
                        <span className="tabular-nums opacity-70">{tag.lessonCount}</span>
                      </button>
                    );
                  })}
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="shrink-0 rounded-full px-2 text-xs font-semibold text-roman-red hover:bg-roman-red/5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red">
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {activeTypeLessons.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-14 text-center">
                  <div
                    className={cn(
                      'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
                      config.iconSurface
                    )}>
                    <ActiveIcon className={cn('h-7 w-7', config.iconColor)} />
                  </div>
                  <h5 className="text-lg font-serif text-slate-800">Nothing here just yet</h5>
                  <p className="mt-1 text-sm text-slate-500">{config.emptyLabel}</p>
                </div>
              ) : visibleLessons.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-14 text-center">
                  <Search className="mx-auto mb-4 h-8 w-8 text-slate-300" />
                  <h5 className="text-lg font-serif text-slate-800">No matching lessons</h5>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedCategory && selectedTagIds.length > 0 && searchQuery.trim()
                      ? `Nothing in ${selectedCategory.name} matches this search with the selected tags.`
                      : selectedTagIds.length > 0
                        ? 'No lessons match the selected tags.'
                        : 'Try another title or clear your search.'}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-roman-red hover:bg-roman-red/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red">
                        Clear search
                      </button>
                    )}
                    {selectedTagIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-roman-red hover:bg-roman-red/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red">
                        Clear tags and search
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                  data-testid="practice-lesson-grid">
                  {visibleLessons.map(lesson => (
                    <PracticeLessonCard
                      key={lesson.id}
                      lesson={lesson}
                      theme={config}
                      showCategoryChips={activeCategoryId === 'all'}
                      categoryTags={selectedCategory?.tags}
                      lessonTagIds={selectedCategory ? getCategoryTagIds(lesson, selectedCategory.id) : undefined}
                      selectedTagIds={selectedTagIds}
                      tagSelectedClass={config.tagSelected}
                      onLessonClick={onLessonClick}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
