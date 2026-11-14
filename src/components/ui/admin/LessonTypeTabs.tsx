import type { LessonSummary } from '@/src/types/lesson';
import { AdminPillPicker } from '@/src/components/admin/shell/AdminPillPicker';

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
    <AdminPillPicker
      role="tablist"
      label="Lesson types"
      value={value}
      onValueChange={onValueChange}
      className={`w-full flex-wrap ${className ?? ''}`}
      options={lessonTypes.map(option => ({ ...option, count: counts ? (counts[option.value] ?? 0) : null, disabled }))}
    />
  );
}
