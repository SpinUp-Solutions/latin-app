'use client';

import { useState } from 'react';
import { BookOpen, Check, ChevronsUpDown } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/src/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/src/components/ui/popover';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { useGetFeedbackLessonsQuery } from '@/src/store/api/studentFeedbackApi';
import type { FeedbackLessonContext } from '@/src/hooks/useFeedbackDraft';
import { cn } from '@/src/lib/utils';
import { FieldHeading } from './FeedbackFields';

const plainText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export function FeedbackLessonPicker({
  id,
  lessonId,
  lessonContext,
  pageNumber,
  onChoose,
}: {
  id: string;
  lessonId: string | null;
  lessonContext?: FeedbackLessonContext;
  pageNumber: number | null;
  onChoose: (lessonId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useGetFeedbackLessonsQuery();
  const lessons = data?.lessons ?? [];
  const selectedTitle =
    lessonId === null
      ? null
      : lessonId === lessonContext?.lessonId
        ? lessonContext.lessonTitle
        : (lessons.find(lesson => lesson.id === lessonId)?.title ?? null);
  const choose = (next: string | null) => {
    onChoose(next);
    setOpen(false);
  };

  return (
    <div>
      <FieldHeading htmlFor={id} optional>
        Is it about a specific lesson?
      </FieldHeading>
      {/* Modal keeps the list scrollable when the picker opens inside the lesson panel. */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-options`}
            className="flex w-full items-center gap-3 rounded-lg border border-input bg-white px-3 py-2.5 text-left text-sm transition-colors hover:border-roman-red/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <BookOpen className="h-4 w-4 shrink-0 text-roman-stone" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {selectedTitle ? (
                <SimpleRichDisplay content={selectedTitle} className="truncate [&_p]:truncate" />
              ) : lessonId ? (
                'Selected lesson'
              ) : (
                <span className="text-muted-foreground">Not about a specific lesson</span>
              )}
            </span>
            {pageNumber !== null && (
              <span className="shrink-0 rounded-full bg-roman-parchment px-2 py-0.5 text-xs font-medium text-roman-stone">
                Page {pageNumber}
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-roman-stone" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0">
          <Command>
            <CommandInput placeholder="Search lessons…" aria-label="Search lessons" />
            <CommandList id={`${id}-options`} className="max-h-72">
              <CommandEmpty>{isLoading ? 'Loading lessons…' : 'No lessons found.'}</CommandEmpty>
              <CommandGroup>
                <CommandItem value="Not about a specific lesson" onSelect={() => choose(null)}>
                  <Check className={cn('mr-2 h-4 w-4', lessonId === null ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  Not about a specific lesson
                </CommandItem>
                {lessonContext && !lessons.some(lesson => lesson.id === lessonContext.lessonId) && (
                  <CommandItem value={`${plainText(lessonContext.lessonTitle)} ${lessonContext.lessonId}`} onSelect={() => choose(lessonContext.lessonId)}>
                    <Check className={cn('mr-2 h-4 w-4', lessonId === lessonContext.lessonId ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                    <SimpleRichDisplay content={lessonContext.lessonTitle} />
                  </CommandItem>
                )}
                {lessons.map(lesson => (
                  <CommandItem key={lesson.id} value={`${plainText(lesson.title)} ${lesson.id}`} onSelect={() => choose(lesson.id)}>
                    <Check className={cn('mr-2 h-4 w-4 shrink-0', lessonId === lesson.id ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                    <SimpleRichDisplay content={lesson.title} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {isError && (
        <p className="mt-2 text-sm text-roman-stone">
          We couldn&apos;t load your lessons.{' '}
          <button type="button" className="font-medium text-roman-red hover:underline" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      )}
    </div>
  );
}
