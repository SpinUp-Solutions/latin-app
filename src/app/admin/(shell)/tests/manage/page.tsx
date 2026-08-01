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
        description="Edit scored tests, manage active versions, and review Learning Path placement."
        actions={
          <Button asChild>
            <Link href="/admin/tests/create">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Create Test
            </Link>
          </Button>
        }
      />
      <TestManager />
    </AdminPage>
  );
}

export default withAdminAuth(ManageTestsPage);
