'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';
import { Button } from '@/src/components/ui/button';
import {
  useDuplicateTestVersionMutation,
  useGetTestByIdQuery,
  useGetTestVersionByIdQuery,
  useUpdateTestMutation,
} from '@/src/store/api/testApi';
import { toast } from 'sonner';

function VersionEditorPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = React.use(params);
  const duplicate = useSearchParams().get('duplicate') === '1';
  const router = useRouter();
  const [duplicateRequestId] = React.useState(() => `duplicate-${crypto.randomUUID()}`);
  const { data: detail, isLoading: loadingTest } = useGetTestByIdQuery(id);
  const { data: version, isLoading: loadingVersion, isError } = useGetTestVersionByIdQuery(versionId);
  const [update, updateState] = useUpdateTestMutation();
  const [duplicateVersion, duplicateState] = useDuplicateTestVersionMutation();
  if (loadingTest || loadingVersion)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  if (!detail || !version || isError)
    return (
      <div className="p-8" role="alert">
        Version not found.
      </div>
    );
  const save = async (value: TestVersionEditorValue) => {
    try {
      await update({
        id,
        changes: {
          versionId,
          test: {
            title: value.test.title,
            description: value.test.description,
            passingPercentage: value.test.passingPercentage,
          },
          version: {
            name: value.version.name,
            pages: value.version.pages,
            vocabularyPoolId: value.version.vocabularyPoolId,
          },
        },
      }).unwrap();
      toast.success('Version and test settings updated');
      router.push(`/admin/tests/edit/${id}`);
    } catch (error) {
      toast.error((error as { data?: { error?: string } })?.data?.error ?? 'Could not save version');
      throw error;
    }
  };
  const runDuplicate = async () => {
    try {
      await duplicateVersion({
        testId: id,
        versionId,
        requestId: duplicateRequestId,
        name: `${version.name} (Copy)`,
      }).unwrap();
      toast.success('Version duplicated into rotation');
      router.push(`/admin/tests/edit/${id}`);
    } catch (error) {
      toast.error((error as { data?: { error?: string } })?.data?.error ?? 'Could not duplicate version');
    }
  };
  return (
    <div className="flex h-screen flex-col bg-roman-marble">
      <header className="border-b bg-white p-3">
        <Button asChild variant="ghost">
          <Link href={`/admin/tests/edit/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to test overview
          </Link>
        </Button>
      </header>
      {duplicate ? (
        <main className="mx-auto max-w-xl p-8">
          <h1 className="font-serif text-2xl">Duplicate {version.name}</h1>
          <p className="my-4 text-gray-600">
            This creates a new rotation version with regenerated page, content, and nested IDs. Retrying this action
            reuses the same duplicate.
          </p>
          <Button onClick={() => void runDuplicate()} disabled={duplicateState.isLoading}>
            {duplicateState.isLoading ? 'Duplicating…' : 'Duplicate into rotation'}
          </Button>
        </main>
      ) : (
        <div className="flex-1 overflow-hidden">
          <TestVersionEditor
            key={version.id}
            initialTest={detail.test}
            initialVersion={version}
            onSave={save}
            saving={updateState.isLoading}
            mockAssignment={{
              testId: id,
              defaultTitle: `${detail.test.title} — ${version.name}`,
              defaultDescription: detail.test.description,
              defaultPassingPercentage: detail.test.passingPercentage,
              onAssigned: mockId => router.push(`/admin/mock-tests/${mockId}`),
            }}
          />
        </div>
      )}
    </div>
  );
}
export default withAdminAuth(VersionEditorPage);
