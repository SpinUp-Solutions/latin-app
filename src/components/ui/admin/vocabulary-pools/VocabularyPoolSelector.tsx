import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Card, CardContent } from '@/src/components/ui/card';
import { Library, Loader2, Search } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import Link from 'next/link';
import { useGetPoolsQuery, useGetPoolSummaryQuery } from '@/src/store/api/vocabularyPoolApi';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import { useDebounce } from '@/src/hooks/useDebounce';
import type { VocabularyPoolSummary } from '@/src/types/vocabulary-pool';

interface VocabularyPoolSelectorProps {
  selectedPoolId?: string;
  onPoolSelect: (poolId: string | undefined) => void;
  disabled?: boolean;
}

export const VocabularyPoolSelector: React.FC<VocabularyPoolSelectorProps> = ({
  selectedPoolId,
  onPoolSelect,
  disabled = false,
}) => {
  const [difficulty, setDifficulty] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastPoolId, setLastPoolId] = useState<string | null>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const filters = { search: debouncedSearchQuery || undefined, difficulty, isActive: true as boolean | null };
  const { data, isLoading, isFetching } = useGetPoolsQuery({ filters, lastPoolId });
  const pools = data?.pools ?? [];
  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastPoolId !== null;
  const { data: directPool } = useGetPoolSummaryQuery(selectedPoolId!, { skip: !selectedPoolId });
  const [selectedPool, setSelectedPool] = useState<VocabularyPoolSummary | null>(null);
  const [showPoolPicker, setShowPoolPicker] = useState(false);

  const handleLoadMore = useCallback(() => {
    if (data?.lastPoolId) setLastPoolId(data.lastPoolId);
  }, [data?.lastPoolId]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    hasMore,
    loading: loadingMore,
    rootMargin: '200px',
  });

  useEffect(() => {
    if (selectedPoolId && directPool) {
      setSelectedPool(directPool);
    } else if (!selectedPoolId) {
      setSelectedPool(null);
    }
  }, [selectedPoolId, directPool]);

  useEffect(() => {
    setLastPoolId(null);
  }, [debouncedSearchQuery, difficulty]);

  return (
    <div className="space-y-4">
      {/* Current Selection Display */}
      {selectedPool ? (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">{selectedPool.name}</h4>
              <p className="text-sm text-gray-600">{selectedPool.description}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span>{selectedPool.metadata.wordCount} words</span>
                <Badge variant="secondary">{selectedPool.metadata.difficulty}</Badge>
                {selectedPool.metadata.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowPoolPicker(true)} disabled={disabled}>
                Change Pool
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onPoolSelect(undefined);
                  setSelectedPool(null);
                }}
                disabled={disabled}>
                Remove Pool
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <Library className="h-8 w-8 mx-auto text-gray-400 mb-2" />
          <p className="text-gray-600 mb-4">No vocabulary pool assigned</p>
          <Button onClick={() => setShowPoolPicker(true)} disabled={disabled}>
            <Library className="h-4 w-4 mr-2" />
            Select Vocabulary Pool
          </Button>
        </div>
      )}

      {/* Pool Selection Modal */}
      <Dialog open={showPoolPicker} onOpenChange={setShowPoolPicker}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Select Vocabulary Pool</DialogTitle>
            <DialogDescription>Choose a vocabulary pool to assign to this lesson</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search pools..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={difficulty || 'all'} onValueChange={value => setDifficulty(value === 'all' ? '' : value)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Difficulties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulties</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pool List */}
            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red mx-auto mb-2" />
                  Loading pools...
                </div>
              ) : pools.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No vocabulary pools found.
                  <br />
                  <Button asChild variant="outline" className="mt-2">
                    <Link href="/admin/vocabulary-pools/create" target="_blank">
                      Create New Pool
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pools.map(pool => (
                    <Card
                      key={pool.id}
                      className={cn(
                        'cursor-pointer hover:bg-gray-50 transition-colors',
                        selectedPoolId === pool.id && 'ring-2 ring-roman-red'
                      )}
                      onClick={() => {
                        onPoolSelect(pool.id);
                        setSelectedPool(pool);
                        setShowPoolPicker(false);
                      }}>
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <h4 className="font-medium">{pool.name}</h4>
                          <p className="text-sm text-gray-600 line-clamp-2">{pool.description}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>{pool.metadata.wordCount} words</span>
                            <Badge variant="secondary" className="text-xs">
                              {pool.metadata.difficulty}
                            </Badge>
                          </div>
                          {selectedPoolId === pool.id && <Badge className="text-xs">Currently Selected</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {(hasMore || loadingMore) && (
                    <div ref={sentinelRef} className="col-span-full flex justify-center py-4">
                      {loadingMore && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading more pools...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPoolPicker(false)}>
              Cancel
            </Button>
            <Button asChild>
              <Link href="/admin/vocabulary-pools/create" target="_blank">
                Create New Pool
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
