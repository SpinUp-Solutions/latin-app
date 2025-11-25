'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGetPoolQuery, useUpdatePoolMutation } from '@/src/store/api/vocabularyPoolApi';
import { PoolForm } from '@/src/components/ui/admin/vocabulary-pools/PoolForm';
import { PoolNotFoundPage } from '@/src/components/ui/admin/vocabulary-pools/PoolNotFoundPage';
import { AdminLoadingPage } from '@/src/components/ui/admin/AdminLoadingPage';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, Library } from 'lucide-react';
import Link from 'next/link';
import type { CreatePoolRequest } from '@/src/types/vocabulary-pool';

interface EditPoolPageProps {
  params: {
    poolId: string;
  };
}

export default function EditPoolPage({ params }: EditPoolPageProps) {
  const { poolId } = params;
  const router = useRouter();
  const { data: pool, isLoading: loading, error } = useGetPoolQuery(poolId);
  const [updatePoolMutation, { isLoading: updating }] = useUpdatePoolMutation();

  const handleUpdatePool = async (poolData: CreatePoolRequest) => {
    try {
      const updateData = {
        name: poolData.name,
        description: poolData.description,
        wordDocIds: poolData.wordDocIds,
        tags: poolData.tags,
        difficulty: poolData.difficulty,
      };

      await updatePoolMutation({ id: poolId, data: updateData }).unwrap();
      toast.success('Vocabulary pool updated successfully');
      router.push(`/admin/vocabulary-pools/${poolId}`);
      return true;
    } catch {
      toast.error('Failed to update vocabulary pool');
      return false;
    }
  };

  const handleCancel = () => {
    router.push(`/admin/vocabulary-pools/${poolId}`);
  };

  if (loading) {
    return <AdminLoadingPage />;
  }

  if (error || !pool) {
    return <PoolNotFoundPage poolId={poolId} error={error ? String(error) : null} />;
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost">
            <Link href={`/admin/vocabulary-pools/${poolId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pool Details
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Edit Vocabulary Pool</h1>
              <p className="text-sm text-roman-stone">Edit pool information and word selection</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-6 px-4 max-w-4xl">
        <PoolForm
          mode="edit"
          initialData={pool}
          onSubmit={handleUpdatePool}
          onCancel={handleCancel}
          isLoading={updating}
        />
      </main>
    </div>
  );
}
