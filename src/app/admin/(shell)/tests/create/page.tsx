'use client';

import { useRouter } from 'next/navigation';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorSaveResult, TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useCreateTestMutation } from '@/src/store/api/testApi';
import { getApiErrorCode, getApiErrorMessage } from '@/src/store/api/baseQuery';
import { toast } from 'sonner';

function CreateTestPage() {
  const router = useRouter();
  const [createTest, { isLoading }] = useCreateTestMutation();
  const save = async (value: TestVersionEditorValue): Promise<TestVersionEditorSaveResult> => {
    const editTest = () => router.replace(`/admin/tests/edit/${value.test.id}`);
    const recoverDraft = () => router.replace(`/admin/tests/edit/${value.test.id}/versions/${value.version.id}/edit`);
    try {
      await createTest(value).unwrap();
      toast.success('Test created');
      return {
        afterSave: ({ draftPreserved }) => (draftPreserved ? recoverDraft() : editTest()),
      };
    } catch (error) {
      if (getApiErrorCode(error) === 'TEST_CREATE_RETRY') {
        toast.info('This test was already created. Reopening your unsaved changes.');
        return { preserveDraft: true, afterSave: recoverDraft };
      }
      toast.error(getApiErrorMessage(error, 'Failed to create test'));
      throw error;
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
      <div className="flex-1 overflow-hidden">
        <TestVersionEditor creationScope="normal-test-create" onSave={save} saving={isLoading} />
      </div>
    </div>
  );
}

export default withAdminAuth(CreateTestPage);
