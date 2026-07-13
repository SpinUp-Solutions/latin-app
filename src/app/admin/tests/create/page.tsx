'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { TestBuilder } from '@/src/components/ui/admin';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useCreateTestMutation } from '@/src/store/api/testApi';
import type { TestDefinition } from '@/src/types/test';
import { toast } from 'sonner';

function CreateTestPage() {
  const router = useRouter();
  const [createTest, { isLoading }] = useCreateTestMutation();
  const save = async (test: TestDefinition) => {
    try {
      const result = await createTest(test).unwrap();
      toast.success('Test created');
      router.push(`/admin/tests/edit/${result.test.id}`);
    } catch (error) {
      const message = (error as { data?: { error?: string } })?.data?.error || 'Failed to create test';
      toast.error(message);
    }
  };
  return (
    <div className="flex h-screen flex-col bg-roman-marble">
      <div className="flex-shrink-0 border-b bg-white p-3">
        <Button asChild variant="ghost">
          <Link href="/admin/tests/manage">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tests
          </Link>
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <TestBuilder onSave={save} saving={isLoading} />
      </div>
    </div>
  );
}

export default withAdminAuth(CreateTestPage);
