'use client';

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/src/components/ui/sheet';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';
import { useFeedbackDraft, type FeedbackLessonContext } from '@/src/hooks/useFeedbackDraft';
import { FeedbackForm } from './FeedbackForm';

/** The draft lives outside the sheet, so closing it keeps what the student wrote. */
export function FeedbackLessonDialog({ context, onOpen }: { context: FeedbackLessonContext; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const draft = useFeedbackDraft(context);
  const changeOpen = (next: boolean) => {
    if (next) onOpen();
    else if (draft.receipt) draft.reset();
    setOpen(next);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="gap-2" aria-label="Feedback">
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Feedback</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <div className="shrink-0 border-b border-roman-gold/20 bg-roman-parchment/50 px-5 py-4 pr-12 sm:px-6">
            <SheetTitle className="font-serif text-xl text-foreground">Share feedback</SheetTitle>
            <SheetDescription className="text-sm text-roman-stone">
              Your lesson stays where you left it while you write.
            </SheetDescription>
          </div>
          <FeedbackForm draft={draft} onReturn={() => changeOpen(false)} />
        </SheetContent>
      </Sheet>
      <UnsavedNavigationDialog guard={draft.navigationGuard} />
    </>
  );
}
