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
  useGetVocabularyPoolUsagesQuery,
} from '@/src/store/api/vocabularyPoolApi';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { useAppSelector, useAppDispatch } from '@/src/store/hooks';
import { updateFilters } from '@/src/store/slices/vocabularyPoolSlice';
import { PoolFilters } from '@/src/components/ui/admin/vocabulary-pools/PoolFilters';
import { PoolList } from '@/src/components/ui/admin/vocabulary-pools/PoolList';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { buildVocabularyPoolDeleteConfirmation } from '@/src/lib/vocabulary-pools/delete-confirmation';

function VocabularyPoolsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const filters = useAppSelector(state => state.vocabularyPools.filters);
  const [lastPoolId, setLastPoolId] = useState<string | null>(null);
  const { data, isLoading, isFetching, error } = useGetPoolsQuery({ filters, lastPoolId });
  const {
    data: usageData,
    error: usageError,
    isLoading: usageLoading,
  } = useGetVocabularyPoolUsagesQuery(undefined, { refetchOnMountOrArgChange: true });
  const [deletePoolMutation] = useDeletePoolMutation();

  const pools = data?.pools ?? [];
  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastPoolId !== null;
  const usageStatus = usageData?.status ?? 'unavailable';
  const usageUnavailable = Boolean(usageError) || (!usageLoading && usageStatus === 'unavailable');
  const usageUnavailableMessage = `${usageData?.message ?? 'Assignment checks are unavailable.'} You can still delete a pool, but it may break lessons or exercises.`;

  useEffect(() => {
    setLastPoolId(null);
  }, [filters]);

  const handleDeletePool = async (poolId: string, poolName: string) => {
    const usages = usageStatus === 'available' ? (usageData?.usagesByPoolId[poolId] ?? []) : [];
    if (!window.confirm(buildVocabularyPoolDeleteConfirmation(poolName, usages, usageStatus))) return;

    try {
      await deletePoolMutation(poolId).unwrap();
      toast.success('Pool deleted successfully');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to delete pool'));
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
          onDelete={handleDeletePool}
          usagesByPoolId={usageData?.usagesByPoolId ?? {}}
        />
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(VocabularyPoolsPage);
