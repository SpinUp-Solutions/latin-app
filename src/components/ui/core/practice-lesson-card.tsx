import { ArrowRight, CheckCircle2, Play } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { LessonWithProgress, StudentLessonSummary } from '@/src/types/lesson';
import type { PracticeTagSummary } from '@/src/types/practice-category';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';

export interface PracticeCardTheme {
  iconSurface: string;
  iconColor: string;
  progress: string;
  glow: string;
}

interface PracticeLessonCardProps {
  lesson: LessonWithProgress | StudentLessonSummary;
  theme: PracticeCardTheme;
  showCategoryChips: boolean;
  categoryTags?: PracticeTagSummary[];
  lessonTagIds?: string[];
  selectedTagIds?: string[];
  tagSelectedClass?: string;
  onLessonClick: (lessonId: string) => void;
}

export function PracticeLessonCard({
  lesson,
  theme,
  showCategoryChips,
  categoryTags = [],
  lessonTagIds = [],
  selectedTagIds = [],
  tagSelectedClass,
  onLessonClick,
}: PracticeLessonCardProps) {
  const title = stripHtmlTags(lesson.title);
  const description = stripHtmlTags(lesson.description ?? '');
  const status = lesson.status ?? 'available';
  const isCompleted = status === 'completed';
  const isInProgress = status === 'in-progress';
  const isLocked = status === 'locked';
  const progress = isCompleted ? 100 : Math.max(0, Math.min(100, Math.round(lesson.progress ?? 0)));
  const actionLabel = isLocked ? 'Locked' : isCompleted ? 'Review' : isInProgress ? 'Continue' : 'Start practice';
  const categories = (lesson.practiceCategories ?? []).filter(category => category.status === 'active');
  const visibleCategories = categories.slice(0, 2);
  const overflowCount = categories.length - visibleCategories.length;
  const selectedTagSet = new Set(selectedTagIds);
  const lessonTagSet = new Set(lessonTagIds);
  const tags = categoryTags
    .filter(tag => tag.status === 'active' && lessonTagSet.has(tag.id))
    .sort(
      (left, right) =>
        Number(selectedTagSet.has(right.id)) - Number(selectedTagSet.has(left.id)) ||
        left.tagOrder - right.tagOrder ||
        left.id.localeCompare(right.id)
    );
  const visibleTags = tags.slice(0, 2);
  const hiddenTags = tags.slice(2);

  const statusLabel = isCompleted ? 'Completed' : isInProgress ? 'In progress' : isLocked ? 'Locked' : 'Ready';
  const statusClass = isCompleted
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : isInProgress
      ? 'border-roman-terracotta/25 bg-roman-terracotta/10 text-roman-red'
      : 'border-slate-200 bg-white/80 text-slate-500';

  return (
    <button
      type="button"
      disabled={isLocked}
      onClick={() => onLessonClick(lesson.id)}
      aria-label={`${actionLabel}: ${title}`}
      className={cn(
        'group relative flex h-[16rem] min-h-0 w-full flex-col overflow-hidden rounded-2xl border bg-white p-5 text-left shadow-[0_12px_35px_-24px_rgba(30,41,59,0.55)] transition duration-300',
        'hover:-translate-y-1 hover:border-roman-red/25 hover:shadow-[0_20px_45px_-24px_rgba(30,41,59,0.45)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2',
        isCompleted ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70' : 'border-slate-200/80',
        isLocked && 'cursor-not-allowed opacity-60 hover:translate-y-0'
      )}>
      <div
        aria-hidden="true"
        className={cn('absolute inset-x-0 top-0 h-24 bg-gradient-to-br opacity-80', theme.glow)}
      />

      <div className="relative flex min-h-11 items-center gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-black/5',
            isCompleted ? 'bg-emerald-100 text-emerald-700' : `${theme.iconSurface} ${theme.iconColor}`
          )}>
          {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </div>
        <h5 className="min-w-0 flex-1 line-clamp-2 text-xl font-serif leading-6 text-slate-950 transition-colors group-hover:text-roman-red">
          {title}
        </h5>
      </div>

      <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
        {showCategoryChips && visibleCategories.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Practice categories">
            {visibleCategories.map(category => (
              <span
                key={category.id}
                className="max-w-[10rem] truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {category.name}
              </span>
            ))}
            {overflowCount > 0 && (
              <span
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500"
                aria-label={`${overflowCount} more ${overflowCount === 1 ? 'category' : 'categories'}`}>
                +{overflowCount}
              </span>
            )}
          </div>
        )}
        {!showCategoryChips && visibleTags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Practice tags">
            {visibleTags.map(tag => {
              const matchesFilter = selectedTagSet.has(tag.id);
              return (
                <span
                  key={tag.id}
                  className={cn(
                    'max-w-[10rem] truncate rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium',
                    matchesFilter && tagSelectedClass
                      ? tagSelectedClass
                      : 'border-slate-100 bg-slate-100 text-slate-600'
                  )}>
                  {tag.name}
                </span>
              );
            })}
            {hiddenTags.length > 0 && (
              <span
                title={hiddenTags.map(tag => tag.name).join(', ')}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500"
                aria-label={`${hiddenTags.length} more tags: ${hiddenTags.map(tag => tag.name).join(', ')}`}>
                +{hiddenTags.length}
              </span>
            )}
          </div>
        )}
        {description && <p className="line-clamp-2 text-sm leading-5 text-slate-600">{description}</p>}
      </div>

      <div className="relative mt-3 border-t border-slate-100 pt-3">
        {isInProgress && (
          <div className="mb-2.5">
            <div className="mb-2 flex min-h-5 items-center justify-between gap-2 text-xs font-medium leading-4 text-slate-500">
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                  statusClass
                )}>
                {statusLabel}
              </span>
              <span>{progress}% complete</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label={`${title} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}>
              <div
                className={cn('h-full rounded-full transition-all', theme.progress)}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        <div className="flex min-w-0 items-center justify-between gap-3 text-sm font-semibold text-slate-800">
          {!isInProgress && (
            <span
              className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]',
                statusClass
              )}>
              {statusLabel}
            </span>
          )}
          <span className={cn('flex min-w-0 items-center justify-between gap-2', isInProgress && 'w-full')}>
            <span className="truncate">{actionLabel}</span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </button>
  );
}
