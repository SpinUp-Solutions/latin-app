import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { Edit, Trash2, Library, Calendar, Hash, Loader2 } from 'lucide-react';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import type { VocabularyPoolSummary, VocabularyPoolUsage } from '@/src/types/vocabulary-pool';

interface PoolListProps {
  pools: VocabularyPoolSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onEdit: (pool: VocabularyPoolSummary) => void;
  onDelete: (poolId: string, poolName: string) => void;
  usagesByPoolId: Record<string, VocabularyPoolUsage[]>;
}

export const PoolList: React.FC<PoolListProps> = ({
  pools,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onEdit,
  onDelete,
  usagesByPoolId,
}) => {
  const [expandedPoolIds, setExpandedPoolIds] = useState<Set<string>>(() => new Set());
  const sentinelRef = useInfiniteScroll({
    onLoadMore,
    hasMore,
    loading: loadingMore,
    rootMargin: '300px',
  });
  if (loading && pools.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red mx-auto mb-4"></div>
        <p className="text-gray-500">Loading vocabulary pools...</p>
      </div>
    );
  }

  if (pools.length === 0) {
    return (
      <RomanCard>
        <RomanCardContent className="p-12 text-center">
          <Library className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No vocabulary pools found</h3>
          <p className="text-gray-500 mb-4">Get started by creating your first vocabulary pool.</p>
          <Button onClick={() => (window.location.href = '/admin/vocabulary-pools/create')}>Create First Pool</Button>
        </RomanCardContent>
      </RomanCard>
    );
  }

  return (
    <div className="space-y-4">
      {pools.map(pool => {
        const usages = usagesByPoolId[pool.id] ?? [];
        const assigned = usages.length > 0;
        const expanded = expandedPoolIds.has(pool.id);
        const visibleUsages = expanded ? usages : usages.slice(0, 2);
        return (
          <RomanCard key={pool.id} className="hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-serif text-gray-900">{pool.name}</h3>
                    <Badge variant={pool.metadata.isActive ? 'default' : 'secondary'} className="text-xs">
                      {pool.metadata.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {pool.metadata.difficulty}
                    </Badge>
                    {assigned && (
                      <Badge variant="secondary" className="text-xs">
                        Assigned ({usages.length})
                      </Badge>
                    )}
                  </div>

                  <p className="text-gray-600 mb-3 line-clamp-2">{pool.description}</p>

                  <div className="flex items-center gap-6 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Hash className="h-4 w-4" />
                      <span>{pool.metadata.wordCount} words</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Created {new Date(pool.metadata.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {pool.metadata.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {pool.metadata.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {assigned && (
                    <div className="mt-3 text-sm text-gray-600" id={`pool-assignment-${pool.id}`}>
                      <p className="font-medium text-gray-700">Assigned to</p>
                      <ul className="mt-1 space-y-1">
                        {visibleUsages.map(usage => (
                          <li key={usage.id}>
                            {usage.editorUrl ? (
                              <a href={usage.editorUrl} className="text-roman-red hover:underline">
                                <SimpleRichDisplay content={usage.label} />
                              </a>
                            ) : (
                              <SimpleRichDisplay content={usage.label} />
                            )}
                          </li>
                        ))}
                      </ul>
                      {usages.length > 2 && (
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-1 h-auto px-0 text-roman-red"
                          onClick={() =>
                            setExpandedPoolIds(current => {
                              const next = new Set(current);
                              if (next.has(pool.id)) next.delete(pool.id);
                              else next.add(pool.id);
                              return next;
                            })
                          }>
                          {expanded ? 'Show less' : `+${usages.length - 2} more`}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button variant="outline" size="sm" onClick={() => onEdit(pool)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(pool.id, pool.name)}
                    title="Delete pool"
                    className="text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </RomanCardContent>
          </RomanCard>
        );
      })}

      {(hasMore || loadingMore) && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loadingMore && (
            <div className="flex items-center gap-2 text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading more pools...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
