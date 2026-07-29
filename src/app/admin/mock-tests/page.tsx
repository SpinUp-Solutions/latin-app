'use client';

import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { MockTestManager } from '@/src/components/ui/admin/MockTestManager';
import { Button } from '@/src/components/ui/button';

function MockTestsPage() {
  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/admin/tests/manage">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Test Management
            </Link>
          </Button>
          <div>
            <h1 className="font-serif text-xl">Mock Tests</h1>
            <p className="text-sm text-gray-500">Independent rehearsal cards and their delivery ownership</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/mock-tests/create">
            <Plus className="mr-2 h-4 w-4" />
            Create standalone mock
          </Link>
        </Button>
      </header>
      <main className="container mx-auto px-4 py-8">
        <MockTestManager />
      </main>
    </div>
  );
}
export default withAdminAuth(MockTestsPage);
