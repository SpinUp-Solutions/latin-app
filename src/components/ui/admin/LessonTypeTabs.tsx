import type { LessonSummary } from '@/src/types/lesson';
import { cn } from '@/src/lib/utils';

type LessonType = LessonSummary['type'];

export interface LessonTypeTab {
  value: LessonType;
  label: string;
}

interface LessonTypeTabsProps {
  value: LessonType;
  onValueChange: (value: LessonType) => void;
  counts?: Partial<Record<LessonType, number>>;
  lessonTypes?: LessonTypeTab[];
  disabled?: boolean;
  className?: string;
}

const defaultLessonTypes: LessonTypeTab[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'vocab', label: 'Vocab' },
  { value: 'sentence-diagramming', label: 'Diagramming' },
  { value: 'listening', label: 'Listening' },
];

export function LessonTypeTabs({
  value,
  onValueChange,
  counts,
  lessonTypes = defaultLessonTypes,
  disabled = false,
  className,
}: LessonTypeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Lesson types"
      className={cn(
        'flex h-auto w-full flex-wrap items-center justify-start gap-1.5 rounded-xl border border-border/80 bg-white/80 p-1.5 shadow-sm',
        className
      )}>
      {lessonTypes.map(({ value: tabValue, label }) => {
        const selected = value === tabValue;
        return (
          <button
            key={tabValue}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            tabIndex={0}
            onClick={() => onValueChange(tabValue)}
            className={cn(
              'group relative h-9 shrink-0 rounded-lg border border-transparent bg-transparent px-3.5 py-2 text-xs font-medium text-roman-stone shadow-none transition-[background-color,color,box-shadow]',
              'hover:bg-roman-parchment hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2',
              selected &&
                'border-primary/20 bg-primary text-primary-foreground shadow-[0_2px_6px_hsl(var(--primary)/0.22)]'
            )}>
            <span className="flex items-center gap-2">
              <span>{label}</span>
              {counts && (
                <span
                  className={cn(
                    'text-[11px] tabular-nums text-roman-stone/70',
                    selected && 'text-primary-foreground/75'
                  )}>
                  {counts[tabValue] ?? 0}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
