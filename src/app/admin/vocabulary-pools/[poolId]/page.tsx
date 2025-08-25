'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Edit, Trash2, Plus, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { useVocabularyPool } from '@/src/hooks/useVocabularyPool';
import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import { PoolHeader } from '@/src/components/ui/admin/vocabulary-pools/PoolHeader';
import { PoolNavigation } from '@/src/components/ui/admin/vocabulary-pools/PoolNavigation';
import { PoolStats } from '@/src/components/ui/admin/vocabulary-pools/PoolStats';
import { PoolWordList } from '@/src/components/ui/admin/vocabulary-pools/PoolWordList';

interface PoolDetailPageProps {
  params: {
    poolId: string;
  };
}

export default function PoolDetailPage({ params }: PoolDetailPageProps) {
  const { poolId } = params;
  const router = useRouter();
  const { pool, loading, error } = useVocabularyPool(poolId);
  const { deletePool, deleting } = useVocabularyPools();

  const handleDeletePool = async () => {
    if (!pool) return;
    
    if (confirm(`Are you sure you want to delete "${pool.name}"? This action cannot be undone.`)) {
      const success = await deletePool(pool.id);
      if (success) {
        toast.success('Pool deleted successfully');
        router.push('/admin/vocabulary-pools');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <PoolHeader
          title="Pool Not Found"
          navigation={<PoolNavigation currentPage="detail" poolId={poolId} />}
        />
        <div className="container mx-auto py-6 px-4 text-center">
          <p className="text-red-600 mb-4">{error || 'Pool not found'}</p>
          <Button onClick={() => router.push('/admin/vocabulary-pools')}>
            Back to Pools
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <PoolHeader
        title={pool.name}
        subtitle={pool.description}
        navigation={
          <PoolNavigation 
            currentPage="detail" 
            poolId={poolId} 
            poolName={pool.name}
          />
        }
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/admin/vocabulary-pools/${poolId}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Info
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/admin/vocabulary-pools/${poolId}/words`}>
                <BookOpen className="h-4 w-4 mr-2" />
                Manage Words
              </Link>
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePool}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Pool
            </Button>
          </div>
        }
      />

      <main className="container mx-auto py-6 px-4 space-y-6">
        <PoolStats pool={pool} />
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif">
              Words in this pool ({pool.words.length})
            </h2>
            <Button asChild>
              <Link href={`/admin/vocabulary-pools/${poolId}/words/add`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Words
              </Link>
            </Button>
          </div>
          
          <PoolWordList 
            words={pool.words.slice(0, 20)}
            poolId={poolId}
            compact={true}
            showRemove={false}
          />
          
          {pool.words.length > 20 && (
            <div className="text-center">
              <Button asChild variant="outline">
                <Link href={`/admin/vocabulary-pools/${poolId}/words`}>
                  View All {pool.words.length} Words
                </Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}