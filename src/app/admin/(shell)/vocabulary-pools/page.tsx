'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import {
  useGetPoolsQuery,
  useDeletePoolMutation,
  useDuplicatePoolMutation,
  useGetVocabularyPoolUsagesQuery,
  usePreparePoolDeletionMutation,
} from '@/src/store/api/vocabularyPoolApi';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useAppSelector, useAppDispatch } from '@/src/store/hooks';
import { updateFilters } from '@/src/store/slices/vocabularyPoolSlice';
import { PoolFilters } from '@/src/components/ui/admin/vocabulary-pools/PoolFilters';
import { PoolList } from '@/src/components/ui/admin/vocabulary-pools/PoolList';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { buildVocabularyPoolDeleteConfirmation } from '@/src/lib/vocabulary-pools/delete-confirmation';
import type { VocabularyPoolSummary } from '@/src/types/vocabulary-pool';

function VocabularyPoolsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const filters = useAppSelector(state => state.vocabularyPools.filters);
  const [lastPoolId, setLastPoolId] = useState<string | null>(null);
  const [duplicatingPoolIds, setDuplicatingPoolIds] = useState<Set<string>>(() => new Set());
  const { data, isLoading, isFetching, error } = useGetPoolsQuery({ filters, lastPoolId });
  const {
    data: usageData,
    error: usageError,
    isLoading: usageLoading,
  } = useGetVocabularyPoolUsagesQuery(undefined, { refetchOnMountOrArgChange: true });
  const [preparePoolDeletion] = usePreparePoolDeletionMutation();
  const [deletePoolMutation] = useDeletePoolMutation();
  const [duplicatePoolMutation] = useDuplicatePoolMutation();

  const pools = data?.pools ?? [];
  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastPoolId !== null;
  const usageStatus = usageData?.status ?? 'unavailable';
  const usageUnavailable = Boolean(usageError) || (!usageLoading && usageStatus === 'unavailable');
  const usageUnavailableMessage = `${usageData?.message ?? 'Assignment checks are unavailable.'} Deletion is disabled until assignments can be verified.`;

  useEffect(() => {
    setLastPoolId(null);
  }, [filters]);

  const handleDeletePool = async (poolId: string) => {
    let challenge;
    try {
      challenge = await preparePoolDeletion(poolId).unwrap();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to check pool assignments'));
      return;
    }

    if (challenge.usageStatus !== 'available') {
      toast.error('Assignment checks are unavailable. The pool was not deleted.');
      return;
    }
    if (challenge.usages.length > 0) {
      toast.error(
        `Remove this pool from ${challenge.usages.length} saved ${challenge.usages.length === 1 ? 'assignment' : 'assignments'} before deleting it.`
      );
      return;
    }

    if (
      !window.confirm(
        buildVocabularyPoolDeleteConfirmation(challenge.poolName, challenge.usages, challenge.usageStatus)
      )
    ) {
      return;
    }

    try {
      await deletePoolMutation({
        poolId,
        confirmationToken: challenge.token,
      }).unwrap();
      toast.success('Pool deleted successfully');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to delete pool'));
    }
  };

  const handleDuplicatePool = async (pool: VocabularyPoolSummary) => {
    if (duplicatingPoolIds.has(pool.id)) return;
    setDuplicatingPoolIds(prev => new Set(prev).add(pool.id));
    try {
      const duplicated = await duplicatePoolMutation({ poolId: pool.id }).unwrap();
      setLastPoolId(null);
      toast.success('Vocabulary pool duplicated successfully', {
        action: {
          label: 'Edit',
          onClick: () => router.push(`/admin/vocabulary-pools/${duplicated.id}/edit`),
        },
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to duplicate vocabulary pool'));
    } finally {
      setDuplicatingPoolIds(prev => {
        const next = new Set(prev);
        next.delete(pool.id);
        return next;
      });
    }
  };

  const handleUpdateFilters = (newFilters: Partial<typeof filters>) => {
    dispatch(updateFilters(newFilters));
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="Vocabulary Pools"
        description="Manage vocabulary collections for lessons."
        actions={
          <Button asChild>
            <Link href="/admin/vocabulary-pools/create">
              <Plus className="mr-2 h-4 w-4" />
              Create New Pool
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <PoolFilters filters={filters} onFiltersChange={handleUpdateFilters} loading={isLoading} />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">
              {(error as { data?: { error?: string } })?.data?.error || 'Failed to load vocabulary pools'}
            </p>
          </div>
        )}

        {usageUnavailable && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4" role="alert">
            <p className="text-amber-800">{usageUnavailableMessage}</p>
          </div>
        )}

        <PoolList
          pools={pools}
          loading={isLoading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={() => {
            if (data?.lastPoolId) setLastPoolId(data.lastPoolId);
          }}
          onEdit={pool => router.push(`/admin/vocabulary-pools/${pool.id}/edit`)}
          onDuplicate={handleDuplicatePool}
          duplicatingPoolIds={duplicatingPoolIds}
          onDelete={handleDeletePool}
          usagesByPoolId={usageData?.usagesByPoolId ?? {}}
          usagesLoading={usageLoading}
        />
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(VocabularyPoolsPage);
