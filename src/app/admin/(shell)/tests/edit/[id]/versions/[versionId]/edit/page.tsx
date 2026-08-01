'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';
import {
  useGetTestByIdQuery,
  useGetTestVersionByIdQuery,
  useUpdateTestVersionDraftMutation,
  useUpdateTestMutation,
} from '@/src/store/api/testApi';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { toast } from 'sonner';

function VersionEditorPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = React.use(params);
  const router = useRouter();
  const { data: detail, isLoading: loadingTest } = useGetTestByIdQuery(id);
  const { data: version, isLoading: loadingVersion, isError } = useGetTestVersionByIdQuery(versionId);
  const [update, updateState] = useUpdateTestMutation();
  const [updateDraft, updateDraftState] = useUpdateTestVersionDraftMutation();
  if (loadingTest || loadingVersion)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  const inactive = detail?.drafts?.some(draft => draft.id === versionId) ?? false;
  const active = detail?.versions.some(candidate => candidate.id === versionId) ?? false;
  if (!detail || !version || isError || (!inactive && !active))
    return (
      <div className="p-8" role="alert">
        Version not found.
      </div>
    );
  const save = async (value: TestVersionEditorValue) => {
    try {
      if (inactive) {
        await updateDraft({
          testId: id,
          versionId,
          changes: {
            name: value.version.name,
            pages: value.version.pages,
            vocabularyPoolId: value.version.vocabularyPoolId,
          },
        }).unwrap();
        toast.success('Inactive version draft saved');
      } else {
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
      }
      router.push(`/admin/tests/edit/${id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save version'));
      throw error;
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
      <div className="flex-1 overflow-hidden">
        <TestVersionEditor
          key={version.id}
          initialTest={detail.test}
          initialVersion={version}
          onSave={save}
          saving={inactive ? updateDraftState.isLoading : updateState.isLoading}
          hideTestSettings={inactive}
          draftMode={inactive}
          mockAssignment={
            active
              ? {
                  testId: id,
                  defaultTitle: `${detail.test.title} — ${version.name}`,
                  defaultDescription: detail.test.description,
                  defaultPassingPercentage: detail.test.passingPercentage,
                  onAssigned: mockId => router.push(`/admin/mock-tests/${mockId}`),
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
export default withAdminAuth(VersionEditorPage);
