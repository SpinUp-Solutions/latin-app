import React from 'react';
import { Loader2, Search } from 'lucide-react';
import { AdvancedWordCard } from './AdvancedWordCard';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import type { TableType } from '@/src/utils/schema-helpers';
import { AdminEmptyState } from '@/src/components/admin/shell';

interface Word {
  root_word?: string;
  [key: string]: unknown;
}

interface AdvancedResultsListProps {
  words: Word[];
  isLoading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  selectedTableType?: TableType | null;
  selectedCellPaths?: string[];
  totalCount?: number;
}

const LoadingSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, idx) => (
      <div key={idx} className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 animate-pulse">
        <div className="flex items-start justify-between mb-2">
          <div className="h-8 w-24 bg-gray-200 rounded" />
          <div className="h-6 w-16 bg-gray-200 rounded-full" />
        </div>
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
    ))}
  </div>
);

const EmptyState: React.FC = () => (
  <AdminEmptyState
    icon={Search}
    title="No words found"
    description="Try adjusting your filters to find the vocabulary you are looking for."
    className="rounded-lg border bg-white"
  />
);

const InfiniteScrollSentinel: React.FC<{
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  loadingMore: boolean;
  hasMore: boolean;
}> = ({ sentinelRef, loadingMore, hasMore }) => {
  if (!hasMore && !loadingMore) return null;

  return (
    <div ref={sentinelRef} className="flex justify-center py-6">
      {loadingMore && (
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading more words...</span>
        </div>
      )}
    </div>
  );
};

export const AdvancedResultsList: React.FC<AdvancedResultsListProps> = ({
  words,
  isLoading,
  loadingMore,
  hasMore,
  onLoadMore,
  totalCount,
}) => {
  console.log('[AdvancedResultsList] Rendering with words:', words.length);
  console.log('[AdvancedResultsList] Sample word:', words[0]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore,
    hasMore,
    loading: loadingMore,
    rootMargin: '400px',
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (words.length === 0) {
    return <EmptyState />;
  }

  let summary = `Showing ${words.length} word${words.length !== 1 ? 's' : ''}`;
  if (typeof totalCount === 'number') {
    summary =
      totalCount <= words.length
        ? `Showing all ${totalCount} word${totalCount !== 1 ? 's' : ''}`
        : `Showing ${words.length} of ${totalCount} words`;
  } else if (hasMore) {
    summary += ' (scroll down for more)';
  }

  return (
    <div className="space-y-4">
      <div className="px-1">
        <p className="text-sm text-gray-600">{summary}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {words.map((word, index) => (
          <AdvancedWordCard key={word.root_word || index} word={word} />
        ))}
      </div>

      <InfiniteScrollSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
    </div>
  );
};
