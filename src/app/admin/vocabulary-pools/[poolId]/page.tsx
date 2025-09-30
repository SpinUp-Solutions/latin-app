'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Edit, Trash2, Plus, BookOpen, ArrowLeft, Library } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { useVocabularyPool } from '@/src/hooks/useVocabularyPool';
import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import { PoolWordList } from '@/src/components/ui/admin/vocabulary-pools/PoolWordList';
import { PoolNotFoundPage } from '@/src/components/ui/admin/vocabulary-pools/PoolNotFoundPage';
import { AdminLoadingPage } from '@/src/components/ui/admin/AdminLoadingPage';
import { Badge } from '@/src/components/ui/badge';
import { Card, CardContent } from '@/src/components/ui/card';

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
    return <AdminLoadingPage />;
  }

  if (error || !pool) {
    return <PoolNotFoundPage poolId={poolId} error={error} />;
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost">
            <Link href="/admin/vocabulary-pools">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Vocabulary Pools
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">{pool.name}</h1>
              {pool.description && <p className="text-sm text-roman-stone">{pool.description}</p>}
            </div>
          </div>
        </div>
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
          <Button variant="destructive" onClick={handleDeletePool} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Pool
          </Button>
        </div>
      </header>

      <main className="container mx-auto py-6 px-4 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{pool.words.length}</div>
              <p className="text-sm text-gray-600">Total Words</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Badge
                variant={
                  pool.metadata.difficulty === 'beginner'
                    ? 'secondary'
                    : pool.metadata.difficulty === 'intermediate'
                      ? 'default'
                      : 'destructive'
                }>
                {pool.metadata.difficulty}
              </Badge>
              <p className="text-sm text-gray-600 mt-1">Difficulty</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Badge variant={pool.metadata.isActive ? 'default' : 'secondary'}>
                {pool.metadata.isActive ? 'Active' : 'Inactive'}
              </Badge>
              <p className="text-sm text-gray-600 mt-1">Status</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif">Words in this pool ({pool.words.length})</h2>
            <Button asChild>
              <Link href={`/admin/vocabulary-pools/${poolId}/words/add`}>
                <Plus className="h-4 w-4 mr-2" />
                Add Words
              </Link>
            </Button>
          </div>

          <PoolWordList words={pool.words.slice(0, 20)} poolId={poolId} compact={true} showRemove={false} />

          {pool.words.length > 20 && (
            <div className="text-center">
              <Button asChild variant="outline">
                <Link href={`/admin/vocabulary-pools/${poolId}/words`}>View All {pool.words.length} Words</Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
