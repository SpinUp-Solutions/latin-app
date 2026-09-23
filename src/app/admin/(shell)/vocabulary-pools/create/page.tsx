'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreatePoolMutation } from '@/src/store/api/vocabularyPoolApi';
import { useCreatePoolFromPoolsMutation } from '@/src/store/api/vocabularyPoolApi';
import { PoolForm } from '@/src/components/ui/admin/vocabulary-pools/PoolForm';
import type { CreatePoolRequest } from '@/src/types/vocabulary-pool';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';
import { getApiErrorCode, getApiErrorMessage } from '@/src/store/api/baseQuery';

const COPY_REQUEST_RESET_CODES = new Set([
  'VOCABULARY_POOL_SOURCE_MEMBERSHIP_CHANGED',
  'VOCABULARY_POOL_COPY_STATE_INVALID',
  'VOCABULARY_POOL_COPY_DESTINATION_ARCHIVED',
]);

function CreatePoolPage() {
  const router = useRouter();
  const [createPoolMutation, { isLoading: creating }] = useCreatePoolMutation();
  const [createPoolFromPoolsMutation, { isLoading: creatingFromPools }] = useCreatePoolFromPoolsMutation();
  const [copyRequestResetVersion, setCopyRequestResetVersion] = useState(0);

  const handleCreatePool = async (poolData: CreatePoolRequest) => {
    try {
      if ((poolData.sourcePoolIds?.length ?? 0) > 0) {
        const result = await createPoolFromPoolsMutation({
          name: poolData.name,
          description: poolData.description,
          difficulty: poolData.difficulty ?? 'beginner',
          tags: poolData.tags ?? [],
          wordDocIds: poolData.wordDocIds ?? [],
          sourcePoolIds: poolData.sourcePoolIds!,
          requestId: poolData.requestId!,
        }).unwrap();
        toast.success(`Vocabulary pool created with ${result.metadata.wordCount} unique words`);
      } else {
        await createPoolMutation(poolData).unwrap();
        toast.success('Vocabulary pool created successfully');
      }
      router.push('/admin/vocabulary-pools');
      return true;
    } catch (error: unknown) {
      if (COPY_REQUEST_RESET_CODES.has(getApiErrorCode(error) ?? '')) {
        setCopyRequestResetVersion(version => version + 1);
      }
      toast.error(getApiErrorMessage(error, 'Failed to create vocabulary pool'));
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
        <PoolForm
          mode="create"
          onSubmit={handleCreatePool}
          onCancel={handleCancel}
          isLoading={creating || creatingFromPools}
          copyRequestResetVersion={copyRequestResetVersion}
        />
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(CreatePoolPage);
