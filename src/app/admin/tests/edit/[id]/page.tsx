'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { TestBuilder } from '@/src/components/ui/admin';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useGetTestByIdQuery, useUpdateTestMutation } from '@/src/store/api/testApi';
import type { TestDefinition } from '@/src/types/test';
import { toast } from 'sonner';

function EditTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data: test, isLoading, isError } = useGetTestByIdQuery(id);
  const [updateTest, { isLoading: saving }] = useUpdateTestMutation();
  const save = async (value: TestDefinition) => {
    try {
      await updateTest(value).unwrap();
      toast.success('Test updated');
    } catch (error) {
      const message = (error as { data?: { error?: string } })?.data?.error || 'Failed to update test';
      toast.error(message);
    }
  };
  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  if (isError || !test) return <div className="p-8 text-center text-red-600">Test not found.</div>;
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
        <TestBuilder key={test.id} initialTest={test} onSave={save} saving={saving} />
      </div>
    </div>
  );
}

export default withAdminAuth(EditTestPage);
