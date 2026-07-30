'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { TestManager } from '@/src/components/ui/admin';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';

function ManageTestsPage() {
  return (
    <AdminPage>
      <AdminPageHeader
        title="Manage Tests"
        description="Edit and organize scored tests and their versions."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/mock-tests">Mock Tests</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/tests/create">
                <Plus className="mr-2 h-4 w-4" />
                Create Test
              </Link>
            </Button>
          </>
        }
      />
      <TestManager />
    </AdminPage>
  );
}

export default withAdminAuth(ManageTestsPage);
