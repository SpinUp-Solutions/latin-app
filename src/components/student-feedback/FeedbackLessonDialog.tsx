'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { FeedbackComposer, type FeedbackLessonContext } from './FeedbackComposer';

export function FeedbackLessonDialog({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: FeedbackLessonContext;
}) {
  return <FeedbackComposer
    entryPoint="lesson"
    lessonContext={context}
    active={open}
    onReturn={() => onOpenChange(false)}
    renderContent={content => <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-2" aria-label="Feedback">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />Feedback
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-white shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(90vh,900px)] sm:w-[min(92vw,760px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-roman-gold/20 px-5 py-4">
            <div>
              <Dialog.Title className="font-serif text-xl text-roman-red">Share feedback</Dialog.Title>
              <Dialog.Description className="text-sm text-roman-stone">Your lesson stays open while you write.</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" aria-label="Close feedback"><X className="h-5 w-5" /></Button></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{content}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>}
  />;
}
