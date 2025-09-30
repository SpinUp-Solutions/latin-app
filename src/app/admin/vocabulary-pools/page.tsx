'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, Plus, Library } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useAuth } from '@/src/hooks/useAuth';

import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import { PoolFilters } from '@/src/components/ui/admin/vocabulary-pools/PoolFilters';
import { PoolList } from '@/src/components/ui/admin/vocabulary-pools/PoolList';

function VocabularyPoolsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const { pools, loading, error, pagination, filters, loadPools, loadMorePools, updateFilters, deletePool } =
    useVocabularyPools();

  useEffect(() => {
    if (user) {
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

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Vocabulary Pools</h1>
              <p className="text-sm text-roman-stone">Manage vocabulary collections for lessons</p>
            </div>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/vocabulary-pools/create">
            <Plus className="h-4 w-4 mr-2" />
            Create New Pool
          </Link>
        </Button>
      </header>

      <main className="container mx-auto py-6 px-4 space-y-6">
        <PoolFilters filters={filters} onFiltersChange={updateFilters} loading={loading} />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={() => loadPools(true)} className="mt-2">
              Try Again
            </Button>
          </div>
        )}

        <PoolList
          pools={pools}
          loading={loading}
          hasMore={pagination.hasMore}
          onLoadMore={loadMorePools}
          onEdit={pool => router.push(`/admin/vocabulary-pools/${pool.id}/edit`)}
          onView={pool => router.push(`/admin/vocabulary-pools/${pool.id}`)}
          onDelete={handleDeletePool}
        />
      </main>
    </div>
  );
}

export default withAdminAuth(VocabularyPoolsPage);
