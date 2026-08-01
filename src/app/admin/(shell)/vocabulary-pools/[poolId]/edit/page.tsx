'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGetPoolQuery, useUpdatePoolMutation } from '@/src/store/api/vocabularyPoolApi';
import { PoolForm } from '@/src/components/ui/admin/vocabulary-pools/PoolForm';
import { AdminLoadingPage } from '@/src/components/ui/admin/AdminLoadingPage';
import { Button } from '@/src/components/ui/button';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import type { CreatePoolRequest } from '@/src/types/vocabulary-pool';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';

interface EditPoolPageProps {
  params: Promise<{
    poolId: string;
  }>;
}

function EditPoolPage({ params }: EditPoolPageProps) {
  const { poolId } = React.use(params);
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
      router.push('/admin/vocabulary-pools');
      return true;
    } catch {
      toast.error('Failed to update vocabulary pool');
      return false;
    }
  };

  const handleCancel = () => {
    router.push('/admin/vocabulary-pools');
  };

  if (loading) {
    return <AdminLoadingPage />;
  }

  if (error || !pool) {
    return (
      <AdminPage>
        <div className="mx-auto max-w-4xl">
          <AdminPageHeader title="Edit Vocabulary Pool" description="Edit pool information and word selection." />
          <RomanCard>
            <RomanCardContent className="p-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
              <h2 className="text-xl font-serif mb-2">Pool Not Found</h2>
              <p className="text-gray-600 mb-4">
                The vocabulary pool you are looking for does not exist or you do not have permission to access it.
              </p>
              <Button asChild>
                <Link href="/admin/vocabulary-pools">Go to Vocabulary Pools</Link>
              </Button>
            </RomanCardContent>
          </RomanCard>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-4xl">
        <AdminPageHeader title="Edit Vocabulary Pool" description="Edit pool information and word selection." />
        <PoolForm
          mode="edit"
          initialData={pool}
          onSubmit={handleUpdatePool}
          onCancel={handleCancel}
          isLoading={updating}
        />
      </div>
    </AdminPage>
  );
}

export default withAdminAuth(EditPoolPage);
