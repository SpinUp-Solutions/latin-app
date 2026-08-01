'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookOpen, FileCheck2, GripVertical, ShieldAlert, X } from 'lucide-react';
import Link from 'next/link';
import type { LessonSummary } from '@/src/types/lesson';
import type { TestUnitSummary } from '@/src/types/test';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';

export function SortableLearningPathLesson({
  unit,
  index,
  disabled,
  onRemove,
  onNavigate,
}: {
  unit: LessonSummary | TestUnitSummary;
  index: number;
  disabled: boolean;
  onRemove: () => void;
  onNavigate?: (href: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: unit.id,
    disabled,
  });
  const isTest = unit.kind === 'test';

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
        zIndex: isDragging ? 10 : 'auto',
      }}
      className={`flex items-center gap-4 rounded-lg border p-4 transition-shadow hover:shadow-sm ${
        isTest ? 'border-roman-gold/35 bg-roman-gold/[0.08]' : 'bg-white'
      }`}>
      <button
        type="button"
        aria-label={`Reorder ${unit.title}`}
        disabled={disabled}
        className="cursor-grab p-1 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        {...attributes}
        {...listeners}>
        <GripVertical className="h-5 w-5" />
      </button>

      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-semibold shadow-[0_1px_2px_rgb(15_23_42/0.06)] ${
          isTest
            ? 'border-roman-gold/35 bg-roman-gold/20 text-foreground'
            : 'border-primary/15 bg-primary/[0.08] text-primary'
        }`}>
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate font-medium text-gray-900" role="heading" aria-level={3}>
            <SimpleRichDisplay content={unit.title} />
          </div>
          <Badge
            variant="outline"
            className={
              isTest
                ? 'border-roman-gold/35 bg-roman-gold/15 text-foreground'
                : 'border-primary/15 bg-primary/[0.08] text-primary'
            }>
            {isTest ? (
              <span className="inline-flex items-center gap-1">
                <FileCheck2 className="h-3 w-3" aria-hidden="true" />
                Test
              </span>
            ) : (
              'Lesson'
            )}
          </Badge>
        </div>
        {unit.description && (
          <div className="mb-2 line-clamp-1 text-sm text-gray-600">
            <SimpleRichDisplay content={unit.description} />
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-gray-500">
          {isTest ? (
            <>
              <FileCheck2 className="h-3 w-3" aria-hidden="true" />
              <span>
                {unit.rotationVersionCount} {unit.rotationVersionCount === 1 ? 'rotation version' : 'rotation versions'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{unit.passingPercentage === null ? 'Score only' : `Pass ≥ ${unit.passingPercentage}%`}</span>
            </>
          ) : (
            <>
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              <span>{unit.totalPages} pages</span>
            </>
          )}
        </div>
      </div>

      <Button size="sm" variant="outline" asChild>
        <Link
          href={isTest ? `/admin/tests/edit/${unit.id}` : `/admin/lessons/edit/${unit.id}`}
          onClick={event => {
            if (!onNavigate) return;
            event.preventDefault();
            onNavigate(isTest ? `/admin/tests/edit/${unit.id}` : `/admin/lessons/edit/${unit.id}`);
          }}>
          Edit
        </Link>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${unit.title} from Learning Path`}>
        <X className="h-4 w-4" />
      </Button>
      {isTest && unit.passingPercentage !== null && (
        <div
          className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-roman-gold"
          title="Students must pass this test before the next unit unlocks">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Gate
        </div>
      )}
    </div>
  );
}
