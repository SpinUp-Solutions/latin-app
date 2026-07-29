'use client';

import Link from 'next/link';
import { ArrowLeft, FileCheck2, Plus } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { TestManager } from '@/src/components/ui/admin';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';

function ManageTestsPage() {
  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost"><Link href="/admin"><ArrowLeft className="mr-2 h-4 w-4" />Back to Admin</Link></Button>
          <div className="flex items-center gap-2"><FileCheck2 className="h-6 w-6 text-roman-red" /><div><h1 className="text-xl font-serif">Manage Tests</h1><p className="text-sm text-gray-500">Edit and try standalone tests</p></div></div>
        </div>
        <div className="flex gap-2"><Button asChild variant="outline"><Link href="/admin/mock-tests">Mock Tests</Link></Button><Button asChild><Link href="/admin/tests/create"><Plus className="mr-2 h-4 w-4" />Create Test</Link></Button></div>
      </header>
      <main className="container mx-auto px-4 py-8"><TestManager /></main>
    </div>
  );
}

export default withAdminAuth(ManageTestsPage);
