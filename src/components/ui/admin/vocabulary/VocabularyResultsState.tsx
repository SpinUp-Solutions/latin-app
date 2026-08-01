import type { RefObject } from 'react';
import { Loader2, Search } from 'lucide-react';
import { AdminEmptyState } from '@/src/components/admin/shell';
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

interface VocabularyInfiniteScrollSentinelProps {
  sentinelRef: RefObject<HTMLDivElement | null>;
  loadingMore: boolean;
  hasMore: boolean;
  className?: string;
}

export function VocabularyInfiniteScrollSentinel({
  sentinelRef,
  loadingMore,
  hasMore,
  className,
}: VocabularyInfiniteScrollSentinelProps) {
  if (!hasMore && !loadingMore) return null;

  return (
    <div ref={sentinelRef} className={cn('flex justify-center py-6', className)}>
      {loadingMore && (
        <div className="flex items-center gap-2 text-gray-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading more words...</span>
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
