import type { LessonSummary } from '@/src/types/lesson';
import { cn } from '@/src/lib/utils';
import { TabsList, TabsTrigger } from '@/src/components/ui/tabs';

type LessonType = LessonSummary['type'];

interface LessonTypeTabsProps {
  counts: Record<LessonType, number>;
  className?: string;
}

const lessonTypes: Array<{
  value: LessonType;
  label: string;
}> = [
  { value: 'normal', label: 'Normal' },
  { value: 'vocab', label: 'Vocab' },
  { value: 'sentence-diagramming', label: 'Diagramming' },
  { value: 'listening', label: 'Listening' },
];

export function LessonTypeTabs({ counts, className }: LessonTypeTabsProps) {
  return (
    <TabsList
      aria-label="Lesson types"
      className={cn(
        'flex h-10 w-full items-stretch justify-start gap-4 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 sm:gap-6',
        className
      )}>
      {lessonTypes.map(({ value, label }) => (
        <TabsTrigger
          key={value}
          value={value}
          className={cn(
            'group relative h-10 shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-0 py-2 text-sm font-medium text-roman-stone shadow-none transition-colors',
            'hover:text-roman-red',
            'data-[state=active]:border-roman-red data-[state=active]:bg-transparent data-[state=active]:text-roman-red data-[state=active]:shadow-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-roman-red focus-visible:ring-offset-2'
          )}>
          <span className="flex items-center gap-2">
            <span>{label}</span>
            <span className="text-xs tabular-nums text-roman-stone/70 group-data-[state=active]:text-roman-red/70">
              {counts[value]}
            </span>
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
