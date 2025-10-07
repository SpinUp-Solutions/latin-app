import React from 'react';
import { Card, CardContent } from '@/src/components/ui/card';
import { Loader2, Search } from 'lucide-react';
import { Word } from '@/src/types/admin-vocabulary';
import { WordCard } from './WordCard';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';

interface VocabularyListProps {
  words: Word[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onEditWord: (word: Word) => void;
}

const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-64" role="status" aria-label="Loading vocabulary">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      <p className="text-sm text-gray-600">Loading vocabulary...</p>
    </div>
  </div>
);

const EmptyState: React.FC = () => (
  <Card className="shadow-sm">
    <CardContent className="py-12">
      <div className="text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
          <Search className="h-8 w-8 text-gray-400" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No words found</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Try adjusting your filters or search terms to find the vocabulary you&apos;re looking for.
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
);

const InfiniteScrollSentinel: React.FC<{
  sentinelRef: React.RefObject<HTMLDivElement>;
  loadingMore: boolean;
  hasMore: boolean;
}> = ({ sentinelRef, loadingMore, hasMore }) => {
  if (!hasMore && !loadingMore) return null;

  return (
    <div ref={sentinelRef} className="flex justify-center p-6 bg-gray-50 border-t border-gray-200">
      {loadingMore && (
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading more words...</span>
        </div>
      )}
    </div>
  );
};

export const VocabularyList: React.FC<VocabularyListProps> = ({
  words,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onEditWord,
}) => {
  const sentinelRef = useInfiniteScroll({
    onLoadMore,
    hasMore,
    loading: loadingMore,
  });

  if (loading) {
    return <LoadingSpinner />;
  }

  if (words.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-0">
      {/* Word count header */}
      <div className="mb-4 px-1">
        <p className="text-sm text-gray-600">
          Showing {words.length} word{words.length !== 1 ? 's' : ''}
          {hasMore && ' (scroll down for more)'}
        </p>
      </div>

      {/* Words list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {words.map((word, index) => (
          <WordCard key={word.id} word={word} onEdit={onEditWord} isLast={index === words.length - 1} />
        ))}

        <InfiniteScrollSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
      </div>
    </div>
  );
};
