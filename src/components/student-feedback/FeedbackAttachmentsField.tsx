'use client';

import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Film, ImagePlus, RotateCcw, X } from 'lucide-react';
import { FEEDBACK_MAX_ATTACHMENTS, FEEDBACK_MEDIA_TYPES } from '@/shared/student-feedback';
import type { useFeedbackUploads } from '@/src/hooks/useFeedbackUploads';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';
import { FieldHeading } from './FeedbackFields';

type Uploads = ReturnType<typeof useFeedbackUploads>;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FeedbackAttachmentsField({
  id,
  uploads,
  onAddFiles,
}: {
  id: string;
  uploads: Uploads;
  onAddFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = uploads.uploads.length >= FEEDBACK_MAX_ATTACHMENTS;

  return (
    <div>
      <FieldHeading htmlFor={id} optional>
        Screenshots or recordings
      </FieldHeading>
      <div
        onDragOver={event => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={event => {
          event.preventDefault();
          setDragging(false);
          onAddFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
          dragging ? 'border-roman-red bg-roman-red/[0.04]' : 'border-roman-gold/40 bg-roman-parchment/40',
          full && 'opacity-60'
        )}>
        <ImagePlus className="h-6 w-6 text-roman-red" aria-hidden="true" />
        <p className="text-sm text-foreground">
          <button
            type="button"
            disabled={full}
            className="font-semibold text-roman-red hover:underline disabled:no-underline"
            onClick={() => inputRef.current?.click()}>
            Choose files
          </button>
          , drop them here, or paste a screenshot
        </p>
        <p className="text-xs text-roman-stone">
          Up to {FEEDBACK_MAX_ATTACHMENTS} files · Images up to 10 MB · Videos up to 100 MB
        </p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          accept={FEEDBACK_MEDIA_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          onChange={event => {
            onAddFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>

      {uploads.uploads.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Attachments">
          {uploads.uploads.map(upload => (
            <li key={upload.id} className="flex items-center gap-3 rounded-lg border border-border bg-white p-2 pr-1.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-roman-parchment">
                {upload.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img src={upload.previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Film className="h-5 w-5 text-roman-stone" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{upload.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-roman-stone" role="status">
                  {upload.status === 'ready' && <CheckCircle2 className="h-3.5 w-3.5 text-roman-green" aria-hidden="true" />}
                  {upload.status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />}
                  <span>
                    {formatFileSize(upload.size)} ·{' '}
                    {upload.status === 'uploading'
                      ? `Uploading ${Math.round(upload.progress * 100)}%`
                      : upload.status === 'ready'
                        ? 'Ready'
                        : 'Upload failed'}
                  </span>
                </p>
                {upload.status === 'uploading' && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-roman-parchment" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-roman-red transition-[width] duration-300"
                      style={{ width: `${Math.max(4, Math.round(upload.progress * 100))}%` }}
                    />
                  </div>
                )}
              </div>
              {upload.status === 'error' && (
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-roman-red" onClick={() => uploads.retry(upload.id)}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-roman-stone"
                aria-label={`Remove ${upload.name}`}
                onClick={() => uploads.remove(upload.id)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
