'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';
import { useCreateTestVersionMutation, useGetTestByIdQuery } from '@/src/store/api/testApi';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { toast } from 'sonner';

function CreateVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const { data: detail } = useGetTestByIdQuery(id);
  const [create, { isLoading }] = useCreateTestVersionMutation();
  if (!detail) return <div className="p-8">Loading test…</div>;
  const save = async (value: TestVersionEditorValue) => {
    try {
      await create({ testId: id, version: value.version }).unwrap();
      toast.success('Inactive version draft saved');
      router.push(`/admin/tests/edit/${id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not add version'));
      throw error;
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
      <div className="flex-1 overflow-hidden">
        <TestVersionEditor
          creationScope={`normal-test-${id}-version-create`}
          defaultVersionName="New Version"
          initialTest={detail.test}
          onSave={save}
          saving={isLoading}
          hideTestSettings
          draftMode
        />
      </div>
    </div>
  );
}
export default withAdminAuth(CreateVersionPage);
