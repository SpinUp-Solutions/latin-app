'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useGetPoolsQuery, useDeletePoolMutation } from '@/src/store/api/vocabularyPoolApi';
import { useAppSelector, useAppDispatch } from '@/src/store/hooks';
import { updateFilters } from '@/src/store/slices/vocabularyPoolSlice';
import { PoolFilters } from '@/src/components/ui/admin/vocabulary-pools/PoolFilters';
import { PoolList } from '@/src/components/ui/admin/vocabulary-pools/PoolList';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';

function VocabularyPoolsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const filters = useAppSelector(state => state.vocabularyPools.filters);
  const [lastPoolId, setLastPoolId] = useState<string | null>(null);
  const { data, isLoading, isFetching, error } = useGetPoolsQuery({ filters, lastPoolId });
  const [deletePoolMutation] = useDeletePoolMutation();

  const pools = data?.pools ?? [];
  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastPoolId !== null;

  useEffect(() => {
    setLastPoolId(null);
  }, [filters]);

  const handleDeletePool = async (poolId: string, poolName: string) => {
    if (confirm(`Are you sure you want to delete "${poolName}"? This action cannot be undone.`)) {
      try {
        await deletePoolMutation(poolId).unwrap();
        toast.success('Pool deleted successfully');
      } catch {
        toast.error('Failed to delete pool');
      }
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
        />
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(VocabularyPoolsPage);
