'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useVocabularyPools } from '@/src/hooks/useVocabularyPools';
import { PoolHeader } from '@/src/components/ui/admin/vocabulary-pools/PoolHeader';
import { PoolNavigation } from '@/src/components/ui/admin/vocabulary-pools/PoolNavigation';
import { PoolForm } from '@/src/components/ui/admin/vocabulary-pools/PoolForm';
import type { CreatePoolRequest } from '@/src/types/vocabulary-pool';

export default function CreatePoolPage() {
  const router = useRouter();
  const { createPool, creating } = useVocabularyPools();

  const handleCreatePool = async (poolData: CreatePoolRequest) => {
    const success = await createPool(poolData);
    
    if (success) {
      toast.success('Vocabulary pool created successfully');
      router.push('/admin/vocabulary-pools');
      return true;
    } else {
      toast.error('Failed to create vocabulary pool');
      return false;
    }
  };

  const handleCancel = () => {
    router.push('/admin/vocabulary-pools');
  };

  return (
    <div className="min-h-screen bg-roman-marble">
      <PoolHeader
        title="Create Vocabulary Pool"
        subtitle="Create a new collection of words for lessons"
        navigation={<PoolNavigation currentPage="create" />}
      />

      <main className="container mx-auto py-6 px-4 max-w-4xl">
        <PoolForm
          mode="create"
          onSubmit={handleCreatePool}
          onCancel={handleCancel}
          isLoading={creating}
        />
      </main>
    </div>
  );
}