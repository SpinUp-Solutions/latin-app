'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorValue } from '@/src/components/ui/admin/TestBuilder';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useGetTestByIdQuery, useGetTestVersionByIdQuery, useUpdateTestMutation } from '@/src/store/api/testApi';
import { toast } from 'sonner';

function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data: detail, isLoading: loadingTest, isError: testError } = useGetTestByIdQuery(id);
  const versionId = detail?.test.rotationVersions[0]?.versionId;
  const {
    data: version,
    isLoading: loadingVersion,
    isError: versionError,
  } = useGetTestVersionByIdQuery(versionId ?? '', { skip: !versionId });
  const [updateTest, { isLoading: saving }] = useUpdateTestMutation();
  const save = async (value: TestVersionEditorValue) => {
    if (!versionId) return;
    try {
      await updateTest({
        id,
        changes: {
          versionId,
          test: {
            title: value.test.title,
            description: value.test.description,
            passingPercentage: value.test.passingPercentage,
          },
          version: { name: value.version.name, pages: value.version.pages },
        },
      }).unwrap();
      toast.success('Test updated');
    } catch (error) {
      const message = (error as { data?: { error?: string } })?.data?.error || 'Failed to update test';
      toast.error(message);
      throw error;
    }
  };
  if (loadingTest || loadingVersion)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  if (testError || versionError || !detail || !version) {
    return <div className="p-8 text-center text-red-600">Test not found.</div>;
  }
  return (
    <div className="flex h-screen flex-col bg-roman-marble">
      <div className="flex flex-shrink-0 items-center justify-between border-b bg-white p-3">
        <Button asChild variant="ghost">
          <Link href="/admin/tests/manage">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tests
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/admin/tests/try/${id}`}>Open Full Test</Link>
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TestVersionEditor
          key={version.id}
          initialTest={detail.test}
          initialVersion={version}
          onSave={save}
          saving={saving}
        />
      </div>
    </div>
  );
}

export default withAdminAuth(EditTestPage);
