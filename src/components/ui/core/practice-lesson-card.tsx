import { ArrowRight, CheckCircle2, Play } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { LessonWithProgress } from '@/src/types/lesson';
import { stripHtmlTags } from '@/src/utils/exercises/helpers';

export interface PracticeCardTheme {
  iconSurface: string;
  iconColor: string;
  progress: string;
  glow: string;
}

interface PracticeLessonCardProps {
  lesson: LessonWithProgress;
  theme: PracticeCardTheme;
  showCategoryChips: boolean;
  onLessonClick: (lessonId: string) => void;
}

export function PracticeLessonCard({ lesson, theme, showCategoryChips, onLessonClick }: PracticeLessonCardProps) {
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

  return (
    <button
      type="button"
      disabled={isLocked}
      onClick={() => onLessonClick(lesson.id)}
      aria-label={`${actionLabel}: ${title}`}
      className={cn(
        'group relative flex min-h-[15rem] w-full flex-col overflow-hidden rounded-2xl border bg-white p-5 text-left shadow-[0_12px_35px_-24px_rgba(30,41,59,0.55)] transition duration-300',
        'hover:-translate-y-1 hover:border-roman-red/25 hover:shadow-[0_20px_45px_-24px_rgba(30,41,59,0.45)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2',
        isCompleted ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70' : 'border-slate-200/80',
        isLocked && 'cursor-not-allowed opacity-60 hover:translate-y-0'
      )}>
      <div
        aria-hidden="true"
        className={cn('absolute inset-x-0 top-0 h-24 bg-gradient-to-br opacity-80', theme.glow)}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-black/5',
            isCompleted ? 'bg-emerald-100 text-emerald-700' : `${theme.iconSurface} ${theme.iconColor}`
          )}>
          {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]',
            isCompleted
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : isInProgress
                ? 'border-roman-terracotta/25 bg-roman-terracotta/10 text-roman-red'
                : 'border-slate-200 bg-white/80 text-slate-500'
          )}>
          {isCompleted ? 'Completed' : isInProgress ? 'In progress' : isLocked ? 'Locked' : 'Ready'}
        </span>
      </div>

      <div className="relative mt-5 flex-1">
        {showCategoryChips && visibleCategories.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Practice categories">
            {visibleCategories.map(category => (
              <span
                key={category.id}
                className="max-w-[10rem] truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {category.name}
              </span>
            ))}
            {overflowCount > 0 && (
              <span
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"
                aria-label={`${overflowCount} more ${overflowCount === 1 ? 'category' : 'categories'}`}>
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        <h5 className="text-lg font-serif leading-snug text-slate-950 transition-colors group-hover:text-roman-red">
          {title}
        </h5>
        {description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{description}</p>}
      </div>

      <div className="relative mt-5 border-t border-slate-100 pt-4">
        {isInProgress && (
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Lesson progress</span>
              <span>{progress}%</span>
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
        <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
          <span>{actionLabel}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </button>
  );
}
