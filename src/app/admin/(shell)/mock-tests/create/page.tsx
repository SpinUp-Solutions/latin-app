'use client';

import { useRouter } from 'next/navigation';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';
import { useCreateStandaloneMockMutation } from '@/src/store/api/mockTestApi';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { toast } from 'sonner';

function CreateMockPage() {
  const router = useRouter();
  const [create, { isLoading }] = useCreateStandaloneMockMutation();
  const save = async (value: TestVersionEditorValue) => {
    try {
      const result = await create({
        mock: {
          id: value.test.id,
          title: value.test.title,
          description: value.test.description,
          passingPercentage: value.test.passingPercentage,
          isLive: false,
        },
        version: value.version,
      }).unwrap();
      toast.success('Standalone mock created as hidden');
      router.push(`/admin/mock-tests/${result.mock.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not create mock test'));
      throw error;
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
      <div className="flex-1 overflow-hidden">
        <TestVersionEditor creationScope="standalone-mock-create" onSave={save} saving={isLoading} />
      </div>
    </div>
  );
}
export default withAdminAuth(CreateMockPage);
