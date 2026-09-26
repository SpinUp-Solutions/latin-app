'use client';

import { useState } from 'react';
import { Download, Film, Play } from 'lucide-react';
import type { FeedbackAttachment } from '@/shared/student-feedback';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/src/components/ui/dialog';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useGetAdminFeedbackAttachmentsQuery } from '@/src/store/api/studentFeedbackApi';
import { formatFileSize } from '@/src/components/student-feedback/FeedbackAttachmentsField';

// Signed links last 15 minutes; refresh them well before they expire.
const LINK_REFRESH_MS = 10 * 60 * 1000;

type Links = { viewUrl: string | null; downloadUrl: string };

function Thumbnail({ attachment, viewUrl }: { attachment: FeedbackAttachment; viewUrl: string | null }) {
  if (!viewUrl) return <Film className="h-8 w-8 text-roman-stone/60" aria-hidden="true" />;
  if (attachment.contentType.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
    return <img src={viewUrl} alt="" className="h-full w-full object-cover" />;
  }
  return (
    <>
      <video src={viewUrl} preload="metadata" muted className="h-full w-full object-cover" aria-hidden="true" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/20">
        <Play className="h-8 w-8 fill-white text-white drop-shadow" aria-hidden="true" />
      </span>
    </>
  );
}

export function FeedbackAttachments({ feedbackId, attachments }: { feedbackId: string; attachments: FeedbackAttachment[] }) {
  const { data, isLoading, isError, error, refetch } = useGetAdminFeedbackAttachmentsQuery(feedbackId, {
    pollingInterval: LINK_REFRESH_MS,
  });
  const [open, setOpen] = useState<FeedbackAttachment | null>(null);
  const links = new Map<string, Links>(data?.items.map(item => [item.id, item]));
  const openLinks = open ? links.get(open.id) : undefined;

  if (isError) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {getApiErrorMessage(error, 'Could not load attachments.')}{' '}
        <button type="button" className="font-medium underline" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {attachments.map(attachment => {
          const itemLinks = links.get(attachment.id);
          return (
            <li key={attachment.id} className="overflow-hidden rounded-lg border border-border bg-white">
              <button
                type="button"
                disabled={!itemLinks?.viewUrl}
                onClick={() => setOpen(attachment)}
                className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-roman-parchment/60 transition-opacity hover:opacity-90 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={`Open ${attachment.name}`}>
                {isLoading ? (
                  <span className="h-full w-full animate-pulse bg-roman-parchment" />
                ) : (
                  <Thumbnail attachment={attachment} viewUrl={itemLinks?.viewUrl ?? null} />
                )}
              </button>
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground" title={attachment.name}>
                    {attachment.name}
                  </p>
                  <p className="text-[11px] text-roman-stone">
                    {formatFileSize(attachment.sizeBytes)}
                    {!itemLinks?.viewUrl && !isLoading && ' · download to view'}
                  </p>
                </div>
                {itemLinks && (
                  <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <a href={itemLinks.downloadUrl} aria-label={`Download ${attachment.name}`}>
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={Boolean(open)} onOpenChange={next => !next && setOpen(null)}>
        <DialogContent className="max-w-4xl gap-3 p-3 sm:p-4">
          <DialogTitle className="truncate pr-8 text-sm font-medium">{open?.name}</DialogTitle>
          {open && openLinks?.viewUrl && (
            <div className="flex max-h-[75vh] items-center justify-center overflow-hidden rounded-md bg-black/90">
              {open.contentType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={openLinks.viewUrl} alt={open.name} className="max-h-[75vh] w-auto object-contain" />
              ) : (
                <video src={openLinks.viewUrl} controls autoPlay className="max-h-[75vh] w-full" />
              )}
            </div>
          )}
          {openLinks && (
            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={openLinks.downloadUrl}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
