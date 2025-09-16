'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, BookOpen } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Lesson } from '@/src/types/lesson';
import Link from 'next/link';
import React from 'react';

interface SortableLessonItemProps {
  lesson: Lesson;
  id: string;
}

export function SortableLessonItem({ lesson, id }: SortableLessonItemProps) {
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
      className="flex items-center gap-4 p-4 bg-white rounded-lg border hover:shadow-sm transition-shadow">
      <button
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
        {...attributes}
        {...listeners}>
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
        {(lesson.liveOrder || 0) + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-medium text-gray-900 truncate">{lesson.title}</h3>
          <Badge variant="default" className="shrink-0">
            Live
          </Badge>
        </div>

        {lesson.description && <p className="text-sm text-gray-600 line-clamp-1 mb-2">{lesson.description}</p>}

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            <span>{lesson.pages?.length || 0} pages</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href={`/admin/lessons/edit/${lesson.id}`}>Edit</Link>
        </Button>
      </div>
    </div>
  );
}
