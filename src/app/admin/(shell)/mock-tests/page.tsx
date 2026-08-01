'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { MockTestManager } from '@/src/components/ui/admin/MockTestManager';
import { Button } from '@/src/components/ui/button';
import { AdminPage, AdminPageHeader } from '@/src/components/admin/shell';

function MockTestsPage() {
  return (
    <AdminPage>
      <AdminPageHeader
        title="Mock Tests"
        description="Manage independent rehearsal cards and their delivery ownership."
        actions={
          <Button asChild>
            <Link href="/admin/mock-tests/create">
              <Plus className="mr-2 h-4 w-4" />
              Create standalone mock
            </Link>
          </Button>
        }
      />
      <MockTestManager />
    </AdminPage>
  );
}
export default withAdminAuth(MockTestsPage);
