import type { LessonSummary } from '@/src/types/lesson';
import { cn } from '@/src/lib/utils';
import { TabsList, TabsTrigger } from '@/src/components/ui/tabs';

type LessonType = LessonSummary['type'];

export interface LessonTypeTab {
  value: LessonType;
  label: string;
}

interface LessonTypeTabsProps {
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
  counts,
  lessonTypes = defaultLessonTypes,
  disabled = false,
  className,
}: LessonTypeTabsProps) {
  return (
    <TabsList
      aria-label="Lesson types"
      className={cn(
        'flex h-auto w-full items-center justify-start gap-1.5 overflow-x-auto rounded-xl border border-border/80 bg-white/80 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}>
      {lessonTypes.map(({ value, label }) => (
        <TabsTrigger
          key={value}
          value={value}
          disabled={disabled}
          className={cn(
            'group relative h-9 shrink-0 rounded-lg border border-transparent bg-transparent px-3.5 py-2 text-xs font-medium text-roman-stone shadow-none transition-[background-color,color,box-shadow]',
            'hover:bg-roman-parchment hover:text-foreground',
            'data-[state=active]:border-primary/20 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_2px_6px_hsl(var(--primary)/0.22)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2'
          )}>
          <span className="flex items-center gap-2">
            <span>{label}</span>
            {counts && (
              <span className="text-[11px] tabular-nums text-roman-stone/70 group-data-[state=active]:text-primary-foreground/75">
                {counts[value] ?? 0}
              </span>
            )}
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
