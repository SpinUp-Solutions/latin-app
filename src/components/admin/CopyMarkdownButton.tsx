'use client';

import { useEffect, useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';

/**
 * An icon button that copies a report as Markdown, for pasting into a chat with
 * an agent. `getMarkdown` runs on click, so the report is only built when wanted.
 */
export function CopyMarkdownButton({ getMarkdown, label }: { getMarkdown: () => string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getMarkdown());
      setCopied(true);
      toast.success('Copied as Markdown');
    } catch {
      toast.error('Unable to copy. Check the browser allows clipboard access.');
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="h-9 w-9 shrink-0"
      aria-label={label}
      title={label}
      onClick={() => void copy()}>
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
    </Button>
  );
}
