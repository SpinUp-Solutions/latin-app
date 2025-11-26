'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreatePoolMutation } from '@/src/store/api/vocabularyPoolApi';
import { PoolForm } from '@/src/components/ui/admin/vocabulary-pools/PoolForm';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, Library } from 'lucide-react';
import Link from 'next/link';
import type { CreatePoolRequest } from '@/src/types/vocabulary-pool';

export default function CreatePoolPage() {
  const router = useRouter();
  const [createPoolMutation, { isLoading: creating }] = useCreatePoolMutation();

  const handleCreatePool = async (poolData: CreatePoolRequest) => {
    console.log('[CREATE POOL FRONTEND] Submitting pool data:', {
      name: poolData.name,
      descriptionLength: poolData.description.length,
      wordCount: poolData.wordDocIds?.length || 0,
      difficulty: poolData.difficulty,
      tags: poolData.tags,
    });

    try {
      const result = await createPoolMutation(poolData).unwrap();
      console.log('[CREATE POOL FRONTEND] ✓ Pool created successfully:', result);
      toast.success('Vocabulary pool created successfully');
      router.push('/admin/vocabulary-pools');
      return true;
    } catch (error: unknown) {
      console.error('[CREATE POOL FRONTEND] ✗ Failed to create pool:', {
        error,
        errorType: error?.constructor?.name,
        errorMessage: error && typeof error === 'object' && 'message' in error ? error.message : 'Unknown',
        data: error && typeof error === 'object' && 'data' in error ? error.data : undefined,
        status: error && typeof error === 'object' && 'status' in error ? error.status : undefined,
      });

      // Extract error message from RTK Query error response
      let errorMessage = 'Failed to create vocabulary pool';
      if (error && typeof error === 'object') {
        if ('data' in error && error.data && typeof error.data === 'object' && 'error' in error.data) {
          errorMessage = String(error.data.error);
        } else if ('message' in error && typeof error.message === 'string') {
          errorMessage = error.message;
        }
      }

      toast.error(errorMessage);
      return false;
    }
  };

  const handleCancel = () => {
    router.push('/admin/vocabulary-pools');
  };

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
              <h1 className="text-xl font-serif tracking-wide">Create Vocabulary Pool</h1>
              <p className="text-sm text-roman-stone">Create a new collection of words for lessons</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-6 px-4 max-w-4xl">
        <PoolForm mode="create" onSubmit={handleCreatePool} onCancel={handleCancel} isLoading={creating} />
      </main>
    </div>
  );
}
