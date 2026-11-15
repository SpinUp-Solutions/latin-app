import type { RefObject } from 'react';
import { Loader2, Search } from 'lucide-react';
import { AdminEmptyState } from '@/src/components/admin/shell';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';

export function VocabularyEmptyState({ description }: { description: string }) {
  return (
    <AdminEmptyState
      icon={Search}
      title="No words found"
      description={description}
      className="rounded-lg border bg-white"
    />
  );
}

export function VocabularyLoadError({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800',
        className
      )}>
      <span>Couldn&apos;t load words for these filters.</span>
      {onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

interface VocabularyInfiniteScrollSentinelProps {
  sentinelRef: RefObject<HTMLDivElement | null>;
  loadingMore: boolean;
  hasMore: boolean;
  className?: string;
  label?: string;
}

export function VocabularyInfiniteScrollSentinel({
  sentinelRef,
  loadingMore,
  hasMore,
  className,
  label = 'Loading more words...',
}: VocabularyInfiniteScrollSentinelProps) {
  if (!hasMore && !loadingMore) return null;

  return (
    <div ref={sentinelRef} className={cn('flex justify-center py-6', className)}>
      {loadingMore && (
        <div className="flex items-center gap-2 text-gray-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span className="text-sm">{label}</span>
        </div>
      )}
    </div>
  );
}

export function formatVocabularyResultsSummary(count: number, hasMore: boolean, totalCount?: number) {
  if (typeof totalCount === 'number') {
    return totalCount <= count
      ? `Showing all ${totalCount} word${totalCount === 1 ? '' : 's'}`
      : `Showing ${count} of ${totalCount} words`;
  }

  return `Showing ${count} word${count === 1 ? '' : 's'}${hasMore ? ' (scroll down for more)' : ''}`;
}
