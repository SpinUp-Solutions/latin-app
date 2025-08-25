'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import { PoolHeader } from '@/src/components/ui/admin/vocabulary-pools/PoolHeader';
import { PoolFilters } from '@/src/components/ui/admin/vocabulary-pools/PoolFilters';
import { PoolList } from '@/src/components/ui/admin/vocabulary-pools/PoolList';

export default function VocabularyPoolsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);
  
  const {
    pools,
    loading,
    error,
    pagination,
    filters,
    loadPools,
    loadMorePools,
    updateFilters,
    deletePool,
  } = useVocabularyPools();

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadPools(true);
    }
  }, [user, loadPools]);

  const handleDeletePool = async (poolId: string, poolName: string) => {
    if (confirm(`Are you sure you want to delete "${poolName}"? This action cannot be undone.`)) {
      const success = await deletePool(poolId);
      if (success) {
        toast.success('Pool deleted successfully');
      }
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <PoolHeader
        title="Vocabulary Pools"
        subtitle="Manage vocabulary collections for lessons"
        navigation={
          <Button variant="ghost" onClick={() => router.push('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        }
        actions={
          <Button asChild>
            <Link href="/admin/vocabulary-pools/create">
              <Plus className="h-4 w-4 mr-2" />
              Create New Pool
            </Link>
          </Button>
        }
      />

      <main className="container mx-auto py-6 px-4 space-y-6">
        <PoolFilters
          filters={filters}
          onFiltersChange={updateFilters}
          loading={loading}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPools(true)}
              className="mt-2"
            >
              Try Again
            </Button>
          </div>
        )}

        <PoolList
          pools={pools}
          loading={loading}
          hasMore={pagination.hasMore}
          onLoadMore={loadMorePools}
          onEdit={(pool) => router.push(`/admin/vocabulary-pools/${pool.id}/edit`)}
          onView={(pool) => router.push(`/admin/vocabulary-pools/${pool.id}`)}
          onDelete={handleDeletePool}
        />
      </main>
    </div>
  );
}