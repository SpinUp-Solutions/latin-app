import React from 'react';
import { VocabularyWordWithId } from '@/src/types/vocabulary/index';
import { WordCard } from './WordCard';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import {
  formatVocabularyResultsSummary,
  VocabularyEmptyState,
  VocabularyInfiniteScrollSentinel,
} from './VocabularyResultsState';

interface VocabularyListProps {
  words: VocabularyWordWithId[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectWord: (word: VocabularyWordWithId) => void;
  onDeleteWord?: (word: VocabularyWordWithId) => void;
  selectedWordId?: string | null;
  deletingWordId?: string | null;
}

const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-64" role="status" aria-label="Loading vocabulary">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      <p className="text-sm text-gray-600">Loading vocabulary...</p>
    </div>
  </div>
);

export const VocabularyList: React.FC<VocabularyListProps> = ({
  words,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onSelectWord,
  onDeleteWord,
  selectedWordId,
  deletingWordId,
}) => {
  const sentinelRef = useInfiniteScroll({
    onLoadMore,
    hasMore,
    loading: loadingMore,
    rootMargin: '500px',
  });

  if (loading) {
    return <LoadingSpinner />;
  }

  if (words.length === 0) {
    return (
      <VocabularyEmptyState description="Try adjusting your filters or search terms to find the vocabulary you are looking for." />
    );
  }

  return (
    <div className="space-y-0">
      {/* Word count header */}
      <div className="mb-4 px-1">
        <p className="text-sm text-gray-600">{formatVocabularyResultsSummary(words.length, hasMore)}</p>
      </div>

      {/* Words list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {words.map((word, index) => (
          <WordCard
            key={word.id}
            word={word}
            onSelect={onSelectWord}
            onDelete={onDeleteWord}
            isSelected={word.id === selectedWordId}
            isDeleting={word.id === deletingWordId}
            isLast={index === words.length - 1}
          />
        ))}

        <VocabularyInfiniteScrollSentinel
          sentinelRef={sentinelRef}
          loadingMore={loadingMore}
          hasMore={hasMore}
          className="border-t border-gray-200 bg-gray-50 p-6"
        />
      </div>
    </div>
  );
};
