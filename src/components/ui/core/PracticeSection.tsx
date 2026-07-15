'use client';

import React, { useId, useMemo, useState } from 'react';
import { BookOpen, Headphones, Layers3, Pencil, Search } from 'lucide-react';
import { Input } from '@/src/components/ui/input';
import { PracticeLessonCard, type PracticeCardTheme } from '@/src/components/ui/core/practice-lesson-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { cn } from '@/src/lib/utils';
import type { LessonWithProgress } from '@/src/types/lesson';
import type { PracticeCategorySummary, PracticeLessonType } from '@/src/types/practice-category';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';
import { lessonMatchesTextSearch } from '@/src/utils/practiceCategoryLessons';

type PracticeTab = PracticeLessonType;
type PracticeTabConfig = PracticeCardTheme & {
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  activeSurface: string;
  emptyLabel: string;
};

interface PracticeSectionProps {
  lessons: LessonWithProgress[];
  onLessonClick: (lessonId: string) => void;
}

const tabOrder: PracticeTab[] = ['vocab', 'sentence-diagramming', 'listening'];

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
  },
};

const getDefaultTab = (lessons: LessonWithProgress[]): PracticeTab =>
  tabOrder.find(type => lessons.some(lesson => lesson.type === type)) ?? 'vocab';

const lessonHasCategory = (lesson: LessonWithProgress, categoryId: string) =>
  lesson.practiceCategories?.some(category => category.status === 'active' && category.id === categoryId) ?? false;

const getCategoryLessonOrder = (lesson: LessonWithProgress, categoryId: string) =>
  lesson.practiceCategoryPlacements?.find(placement => placement.categoryId === categoryId)?.lessonOrder ??
  Number.MAX_SAFE_INTEGER;

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

export const PracticeSection: React.FC<PracticeSectionProps> = ({ lessons, onLessonClick }) => {
  const panelId = useId();
  const [activeTab, setActiveTab] = useState<PracticeTab>(() => getDefaultTab(lessons));
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const lessonsByType = useMemo(() => {
    const grouped: Record<PracticeTab, LessonWithProgress[]> = {
      vocab: [],
      'sentence-diagramming': [],
      listening: [],
    };
    lessons.forEach(lesson => {
      if (lesson.type !== 'normal') grouped[lesson.type].push(lesson);
    });
    return grouped;
  }, [lessons]);

  const lessonCounts: Record<PracticeTab, number> = {
    vocab: lessonsByType.vocab.length,
    'sentence-diagramming': lessonsByType['sentence-diagramming'].length,
    listening: lessonsByType.listening.length,
  };
  const activeTypeLessons = lessonsByType[activeTab];

  const { categories, categoryCounts } = useMemo(() => {
    const byId = new Map<string, PracticeCategorySummary>();
    const counts = new Map<string, number>();
    activeTypeLessons.forEach(lesson => {
      lesson.practiceCategories?.forEach(category => {
        if (category.status !== 'active' || category.lessonType !== activeTab) return;
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
  }, [activeTab, activeTypeLessons]);

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

  const visibleLessons = useMemo(
    () => collectionLessons.filter(lesson => lessonMatchesTextSearch(lesson, searchQuery)),
    [collectionLessons, searchQuery]
  );

  if (lessons.length === 0) return null;

  const config = tabConfig[activeTab];
  const ActiveIcon = config.icon;
  const collectionTitle = selectedCategory?.name ?? `All ${config.shortLabel} practice`;
  const collectionDescription =
    selectedCategory?.description ??
    `Browse every ${config.shortLabel.toLocaleLowerCase()} practice lesson in one place.`;

  const selectTab = (tab: PracticeTab) => {
    setActiveTab(tab);
    setSelectedCategoryId('all');
    setSearchQuery('');
  };

  const selectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
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

          <div
            className="grid w-full grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-white/75 p-1.5 shadow-sm xl:max-w-2xl"
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
                    {lessonCounts[tab]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        id={`${panelId}-panel`}
        role="tabpanel"
        aria-labelledby={`${panelId}-${activeTab}-tab`}
        className="relative lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
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
                    {collectionLessons.length} {collectionLessons.length === 1 ? 'lesson' : 'lessons'}
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
              <p className="mt-1 text-sm text-slate-500">Try another title or clear your search.</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 rounded-lg px-3 py-2 text-sm font-semibold text-roman-red hover:bg-roman-red/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red">
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="practice-lesson-grid">
              {visibleLessons.map(lesson => (
                <PracticeLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  theme={config}
                  showCategoryChips={activeCategoryId === 'all'}
                  onLessonClick={onLessonClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
