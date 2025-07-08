import React from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Word } from '@/src/types/admin-vocabulary';
import { WordCard } from './WordCard';

interface VocabularyListProps {
  words: Word[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onEditWord: (word: Word) => void;
}

export const VocabularyList: React.FC<VocabularyListProps> = ({
  words,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onEditWord,
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-gray-500">
            <p className="text-lg">No words found</p>
            <p className="text-sm mt-2">Try adjusting your filters or search terms</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-0 border border-gray-200 rounded-lg overflow-hidden">
      {words.map((word, index) => (
        <WordCard key={word.id} word={word} onEdit={onEditWord} isLast={index === words.length - 1} />
      ))}

      {hasMore && (
        <div className="flex justify-center p-4 bg-gray-50">
          <Button onClick={onLoadMore} disabled={loadingMore} className="flex items-center gap-2">
            {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
            {loadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
};
