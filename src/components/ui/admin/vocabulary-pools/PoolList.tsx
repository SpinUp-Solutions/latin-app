import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '@/src/components/ui/core/simple-rich-display';
import { Skeleton } from '@/src/components/ui/skeleton';
import { Edit, Trash2, Copy, Library, Calendar, Hash, Loader2 } from 'lucide-react';
import { useInfiniteScroll } from '@/src/hooks/useInfiniteScroll';
import { cn } from '@/src/lib/utils';
import type { VocabularyPoolSummary, VocabularyPoolUsage } from '@/src/types/vocabulary-pool';

const assignmentReveal = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

interface PoolListProps {
  pools: VocabularyPoolSummary[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  fetching?: boolean;
  onLoadMore: () => void;
  onEdit: (pool: VocabularyPoolSummary) => void;
  onDuplicate?: (pool: VocabularyPoolSummary) => void;
  duplicatingPoolIds?: Set<string>;
  onDelete: (poolId: string, poolName: string) => void;
  usagesByPoolId: Record<string, VocabularyPoolUsage[]>;
  usagesLoading?: boolean;
}

function assignmentTransition(reduceMotion: boolean | null) {
  return reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };
}

function AssignedUsagesSkeleton() {
  return (
    <div className="mt-3 space-y-2" aria-label="Loading assignments">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-[85%]" />
      <Skeleton className="h-4 w-[58%]" />
      <span className="sr-only">Loading assigned lessons</span>
    </div>
  );
}

function PoolAssignedBadge({ count }: { count: number }) {
  return (
    <Badge variant="secondary" className="text-xs">
      Assigned ({count})
    </Badge>
  );
}

function PoolAssignedUsages({
  poolId,
  usages,
  expanded,
  onToggleExpanded,
}: {
  poolId: string;
  usages: VocabularyPoolUsage[];
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const visibleUsages = expanded ? usages : usages.slice(0, 2);

  return (
    <div className="mt-3 text-sm text-gray-600" id={`pool-assignment-${poolId}`}>
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
        <Button variant="link" size="sm" className="mt-1 h-auto px-0 text-roman-red" onClick={onToggleExpanded}>
          {expanded ? 'Show less' : `+${usages.length - 2} more`}
        </Button>
      )}
    </div>
  );
}

export const PoolList: React.FC<PoolListProps> = ({
  pools,
  loading,
  loadingMore,
  hasMore,
  fetching = false,
  onLoadMore,
  onEdit,
  onDuplicate,
  duplicatingPoolIds,
  onDelete,
  usagesByPoolId,
  usagesLoading = false,
}) => {
  const reduceMotion = useReducedMotion();
  const revealTransition = assignmentTransition(reduceMotion);
  const [expandedPoolIds, setExpandedPoolIds] = useState<Set<string>>(() => new Set());
  const uniquePools = pools.filter((pool, index, list) => list.findIndex(candidate => candidate.id === pool.id) === index);
  const sentinelRef = useInfiniteScroll({
    onLoadMore,
    hasMore,
    loading: loadingMore,
    rootMargin: '300px',
  });
  if ((loading || fetching) && pools.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red mx-auto mb-4"></div>
        <p className="text-gray-500">Loading vocabulary pools...</p>
      </div>
    );
  }

  if (uniquePools.length === 0) {
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
      {uniquePools.map(pool => {
        const usages = usagesByPoolId[pool.id] ?? [];
        const assigned = usages.length > 0;
        const expanded = expandedPoolIds.has(pool.id);
        const isDuplicating = duplicatingPoolIds?.has(pool.id) ?? false;
        return (
          <RomanCard key={pool.id} className="hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-serif text-gray-900">{pool.name}</h3>
                    <Badge variant={pool.metadata.isActive ? 'default' : 'secondary'} className="text-xs">
                      {pool.metadata.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {pool.metadata.difficulty}
                    </Badge>
                    <AnimatePresence initial={false} mode="wait">
                      {usagesLoading ? (
                        <motion.span
                          key="assigned-badge-loading"
                          initial={{ opacity: 0, scale: 0.94 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.94 }}
                          transition={revealTransition}
                          className="inline-flex">
                          <Skeleton className="h-5 w-[6.25rem] rounded-full" />
                        </motion.span>
                      ) : assigned ? (
                        <motion.span
                          key="assigned-badge"
                          initial={{ opacity: 0, scale: 0.94 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={revealTransition}
                          className="inline-flex">
                          <PoolAssignedBadge count={usages.length} />
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
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

                  <div
                    className={cn(
                      'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                      usagesLoading || assigned ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    )}>
                    <div className="min-h-0 overflow-hidden">
                      <AnimatePresence initial={false} mode="wait">
                        {usagesLoading ? (
                          <motion.div
                            key="assigned-loading"
                            {...assignmentReveal}
                            transition={revealTransition}
                            aria-busy="true">
                            <AssignedUsagesSkeleton />
                          </motion.div>
                        ) : assigned ? (
                          <motion.div key="assigned-usages" {...assignmentReveal} transition={revealTransition}>
                            <PoolAssignedUsages
                              poolId={pool.id}
                              usages={usages}
                              expanded={expanded}
                              onToggleExpanded={() =>
                                setExpandedPoolIds(current => {
                                  const next = new Set(current);
                                  if (next.has(pool.id)) next.delete(pool.id);
                                  else next.add(pool.id);
                                  return next;
                                })
                              }
                            />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                <div className="ml-4 flex shrink-0 items-center gap-2">
                  <Button size="sm" onClick={() => onEdit(pool)} className="h-9 font-sans">
                    <Edit className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Edit
                  </Button>
                  {onDuplicate && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDuplicate(pool)}
                      disabled={isDuplicating}
                      title="Duplicate pool"
                      className="h-9 border border-border bg-white font-sans text-foreground hover:bg-roman-parchment hover:text-foreground">
                      {isDuplicating ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      )}
                      Duplicate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(pool.id, pool.name)}
                    title="Delete pool"
                    aria-label={`Delete ${pool.name}`}
                    className="h-9 w-9 shrink-0 border border-border bg-white p-0 font-sans text-roman-stone hover:bg-primary/10 hover:text-primary">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
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
