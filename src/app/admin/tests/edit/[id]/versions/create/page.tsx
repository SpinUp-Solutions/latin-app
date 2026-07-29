'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';
import { Button } from '@/src/components/ui/button';
import { useCreateTestVersionMutation, useGetTestByIdQuery } from '@/src/store/api/testApi';
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
      router.push(`/admin/tests/edit/${id}`);
    } catch (error) {
      toast.error((error as { data?: { error?: string } })?.data?.error ?? 'Could not add version');
      throw error;
    }
  };
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-white p-3">
        <Button asChild variant="ghost">
          <Link href={`/admin/tests/edit/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to test overview
          </Link>
        </Button>
      </header>
      <div className="flex-1 overflow-hidden">
        <TestVersionEditor
          creationScope={`normal-test-${id}-version-create`}
          defaultVersionName="New Version"
          initialTest={detail.test}
          onSave={save}
          saving={isLoading}
        />
      </div>
    </div>
  );
}
export default withAdminAuth(CreateVersionPage);
