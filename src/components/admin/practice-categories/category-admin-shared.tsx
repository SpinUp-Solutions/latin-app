'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/src/components/ui/alert-dialog';
import { Button } from '@/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Skeleton } from '@/src/components/ui/skeleton';
import { Textarea } from '@/src/components/ui/textarea';
import { getApiErrorMessage, hasApiErrorStatus } from '@/src/store/api/baseQuery';
import type {
  PracticeCategory,
  PracticeCategoryStatus,
  PracticeCategoryWithCounts,
  PracticeLessonType,
} from '@/src/types/practice-category';

export const PRACTICE_LESSON_TYPES: Array<{ value: PracticeLessonType; label: string; shortLabel: string }> = [
  { value: 'vocab', label: 'Vocabulary', shortLabel: 'Vocabulary' },
  { value: 'sentence-diagramming', label: 'Sentence Diagramming', shortLabel: 'Diagramming' },
  { value: 'listening', label: 'Listening', shortLabel: 'Listening' },
];

export const isPracticeLessonType = (value: string | null): value is PracticeLessonType =>
  PRACTICE_LESSON_TYPES.some(option => option.value === value);

export const practiceLessonTypeLabel = (lessonType: PracticeLessonType) =>
  PRACTICE_LESSON_TYPES.find(option => option.value === lessonType)?.label ?? lessonType;

export const parsePracticeCategoryContext = (
  search: string
): {
  lessonType: PracticeLessonType;
  status: PracticeCategoryStatus;
} => {
  const params = new URLSearchParams(search);
  const lessonType = params.get('lessonType');
  return {
    lessonType: isPracticeLessonType(lessonType) ? lessonType : 'vocab',
    status: params.get('status') === 'archived' ? 'archived' : 'active',
  };
};

export const getCategoryCounts = (category: PracticeCategoryWithCounts | PracticeCategory) => {
  const withCounts = category as PracticeCategoryWithCounts;
  return {
    assigned: Number(withCounts.assignedLessonCount ?? 0),
    live: Number(withCounts.liveLessonCount ?? 0),
    draft: Number(withCounts.draftLessonCount ?? 0),
  };
};

export const useBrowserNavigationProtection = (dirty: boolean, itemName = 'order changes') => {
  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const currentUrl = window.location.href;
    const handlePopState = () => {
      const shouldLeave = window.confirm(`Discard your unsaved ${itemName}?`);
      if (!shouldLeave) {
        window.history.pushState(window.history.state, '', currentUrl);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [dirty, itemName]);
};

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
  destructive?: boolean;
  cancelLabel?: string;
}

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  destructive = false,
  cancelLabel = 'Cancel',
}: ConfirmActionDialogProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={nextOpen => !pending && onOpenChange(nextOpen)}>
      <AlertDialogContent
        className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto"
        onOpenAutoFocus={() => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={event => {
          const target = returnFocusRef.current?.isConnected
            ? returnFocusRef.current
            : document.querySelector<HTMLElement>('[data-dialog-focus-fallback]');
          returnFocusRef.current = null;
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() => void onConfirm()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {pending ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface CategoryFormSubmission {
  lessonType: PracticeLessonType;
  name: string;
  description?: string;
}

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  currentType: PracticeLessonType;
  category?: PracticeCategoryWithCounts | PracticeCategory | null;
  onSubmit: (submission: CategoryFormSubmission) => Promise<void>;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  mode,
  currentType,
  category,
  onSubmit,
}: CategoryFormDialogProps) {
  const [lessonType, setLessonType] = useState<PracticeLessonType>(currentType);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const initial = useMemo(
    () => ({
      lessonType: mode === 'edit' && category ? category.lessonType : currentType,
      name: mode === 'edit' && category ? category.name : '',
      description: mode === 'edit' && category ? (category.description ?? '') : '',
    }),
    [category, currentType, mode]
  );

  useEffect(() => {
    if (!open) return;
    setLessonType(initial.lessonType);
    setName(initial.name);
    setDescription(initial.description);
    setNameError(null);
    setFormError(null);
    setSubmitting(false);
    setDiscardOpen(false);
  }, [initial, open]);

  const dirty = lessonType !== initial.lessonType || name !== initial.name || description !== initial.description;

  const close = () => {
    if (submitting) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required');
      requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }

    setNameError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        lessonType,
        name: trimmedName,
        description: description.trim(),
      });
      onOpenChange(false);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to save the category');
      const isConflict = hasApiErrorStatus(error, 409) || /already exists|conflict|unique/i.test(message);
      if (isConflict) {
        setNameError(`A ${practiceLessonTypeLabel(lessonType)} category with this name already exists`);
        requestAnimationFrame(() => nameRef.current?.focus());
      } else {
        setFormError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={nextOpen => (nextOpen ? onOpenChange(true) : close())}>
        <DialogContent
          className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-xl"
          onOpenAutoFocus={() => {
            returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={event => {
            const target = returnFocusRef.current?.isConnected
              ? returnFocusRef.current
              : document.querySelector<HTMLElement>('[data-dialog-focus-fallback]');
            returnFocusRef.current = null;
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
          onEscapeKeyDown={event => {
            if (submitting || dirty) {
              event.preventDefault();
              close();
            }
          }}
          onPointerDownOutside={event => {
            if (submitting || dirty) {
              event.preventDefault();
              close();
            }
          }}>
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Create category' : 'Edit category'}</DialogTitle>
            <DialogDescription>
              Categories are reusable tags. A lesson can be assigned to more than one category.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="practice-category-type">Lesson type</Label>
              {mode === 'create' ? (
                <Select value={lessonType} onValueChange={value => setLessonType(value as PracticeLessonType)}>
                  <SelectTrigger id="practice-category-type" aria-label="Lesson type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRACTICE_LESSON_TYPES.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div
                  id="practice-category-type"
                  className="rounded-md border bg-muted/50 px-3 py-2 text-sm"
                  aria-label={`Lesson type: ${practiceLessonTypeLabel(lessonType)}`}>
                  {practiceLessonTypeLabel(lessonType)}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="practice-category-name">Name</Label>
              <Input
                ref={nameRef}
                id="practice-category-name"
                value={name}
                maxLength={120}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'practice-category-name-error' : undefined}
                onChange={event => {
                  setName(event.target.value);
                  if (nameError) setNameError(null);
                }}
                autoFocus
              />
              {nameError && (
                <p id="practice-category-name-error" className="text-sm text-destructive" role="alert">
                  {nameError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="practice-category-description">Description (optional)</Label>
              <Textarea
                id="practice-category-description"
                value={description}
                maxLength={500}
                rows={4}
                onChange={event => setDescription(event.target.value)}
              />
            </div>

            {formError && (
              <div
                className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={submitting} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {submitting ? 'Saving…' : mode === 'create' ? 'Create category' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard unsaved category changes?"
        description="Your edits in this dialog have not been saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

export function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-28 items-center gap-4 rounded-lg border bg-white p-4">
          <Skeleton className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
          <Skeleton className="h-9 w-9 shrink-0" />
        </div>
      ))}
      <span className="sr-only">Loading category information</span>
    </div>
  );
}

export function InlineLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-white p-6" role="alert">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <h2 className="font-medium text-gray-900">Unable to load this information</h2>
            <p className="mt-1 text-sm text-roman-stone">{message}</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}
