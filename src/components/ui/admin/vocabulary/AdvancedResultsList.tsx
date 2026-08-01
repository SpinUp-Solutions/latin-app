import React from 'react';
import { AdvancedWordCard } from './AdvancedWordCard';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import type { TableType } from '@/src/utils/schema-helpers';
import {
  formatVocabularyResultsSummary,
  VocabularyEmptyState,
  VocabularyInfiniteScrollSentinel,
} from './VocabularyResultsState';

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

export const AdvancedResultsList: React.FC<AdvancedResultsListProps> = ({
  words,
  isLoading,
  loadingMore,
  hasMore,
  onLoadMore,
  totalCount,
}) => {
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
    return (
      <VocabularyEmptyState description="Try adjusting your filters to find the vocabulary you are looking for." />
    );
  }

  const summary = formatVocabularyResultsSummary(words.length, hasMore, totalCount);

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

      <VocabularyInfiniteScrollSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
    </div>
  );
};
