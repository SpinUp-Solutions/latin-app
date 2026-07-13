'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { TestRunner } from '@/src/components/ui/admin';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { useGetTestByIdQuery } from '@/src/store/api/testApi';

function TryTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data: test, isLoading, isError } = useGetTestByIdQuery(id);
  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (isError || !test) return <div className="p-8 text-center text-red-600">Test not found.</div>;
  return <div className="min-h-screen bg-roman-marble"><TestRunner test={test} /></div>;
}

export default withAdminAuth(TryTestPage);
