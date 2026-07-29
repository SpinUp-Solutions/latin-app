'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { TestVersionEditor } from '@/src/components/ui/admin';
import type { TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';
import { Button } from '@/src/components/ui/button';
import { useCreateStandaloneMockMutation } from '@/src/store/api/mockTestApi';
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
      const message = (error as { data?: { error?: string } })?.data?.error ?? 'Could not create mock test';
      toast.error(message);
      throw error;
    }
  };
  return (
    <div className="flex h-screen flex-col bg-roman-marble">
      <header className="border-b bg-white p-3">
        <Button asChild variant="ghost">
          <Link href="/admin/mock-tests">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Mock Tests
          </Link>
        </Button>
      </header>
      <div className="flex-1 overflow-hidden">
        <TestVersionEditor creationScope="standalone-mock-create" onSave={save} saving={isLoading} />
      </div>
    </div>
  );
}
export default withAdminAuth(CreateMockPage);
