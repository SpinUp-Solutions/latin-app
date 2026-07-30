'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreatePoolMutation } from '@/src/store/api/vocabularyPoolApi';
import { PoolForm } from '@/src/components/ui/admin/vocabulary-pools/PoolForm';
import type { CreatePoolRequest } from '@/src/types/vocabulary-pool';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';

function CreatePoolPage() {
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
    <AdminPage>
      <div className="mx-auto max-w-4xl">
        <AdminPageHeader title="Create Vocabulary Pool" description="Create a new collection of words for lessons." />
        <PoolForm mode="create" onSubmit={handleCreatePool} onCancel={handleCancel} isLoading={creating} />
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(CreatePoolPage);
