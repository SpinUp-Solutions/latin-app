'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, BookOpen, Edit } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { LessonSummary } from '@/src/types/lesson';
import Link from 'next/link';
import React from 'react';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { PracticeCategoryChips } from '@/src/components/ui/admin/practice-categories/PracticeCategoryChips';

interface SortableLessonItemProps {
  lesson: LessonSummary;
  id: string;
  onNavigate?: (href: string) => void;
}

export function SortableLessonItem({ lesson, id, onNavigate }: SortableLessonItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 flex-col gap-3 rounded-lg border bg-white p-4 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:gap-4">
      <button
        className="cursor-grab p-1 text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        {...attributes}
        {...listeners}>
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.08] text-sm font-semibold text-primary shadow-[0_1px_2px_rgb(15_23_42/0.06)]">
        {(lesson.liveOrder || 0) + 1}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 font-medium text-gray-900" role="heading" aria-level={3}>
            <SimpleRichDisplay content={lesson.title} className="break-words [&_p]:break-words" />
          </div>
          <Badge variant="default" className="shrink-0">
            Live
          </Badge>
        </div>

        {lesson.description && (
          <div className="text-sm text-gray-600 line-clamp-1 mb-2">
            <SimpleRichDisplay content={lesson.description} />
          </div>
        )}

        {lesson.type !== 'normal' && lesson.practiceCategories && lesson.practiceCategories.length > 0 && (
          <PracticeCategoryChips categories={lesson.practiceCategories} maxVisible={2} className="mb-2" />
        )}

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            <span>{lesson.totalPages} pages</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" asChild className="h-9 font-sans">
          <Link
            href={`/admin/lessons/edit/${lesson.id}`}
            onClick={event => {
              if (!onNavigate) return;
              event.preventDefault();
              onNavigate(`/admin/lessons/edit/${lesson.id}`);
            }}>
            <Edit className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Edit
          </Link>
        </Button>
      </div>
    </div>
  );
}
