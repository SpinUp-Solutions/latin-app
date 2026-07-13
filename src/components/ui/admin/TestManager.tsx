'use client';

import React from 'react';
import Link from 'next/link';
import { Edit, Loader2, Play, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { useDeleteTestMutation, useGetTestsQuery } from '@/src/store/api/testApi';
import { toast } from 'sonner';

export function TestManager() {
  const { data: tests = [], isLoading, isError } = useGetTestsQuery();
  const [deleteTest, { isLoading: deleting }] = useDeleteTestMutation();

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteTest(id).unwrap();
      toast.success('Test deleted');
    } catch {
      toast.error('Failed to delete test');
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  if (isError) return <div className="rounded-md border border-red-200 bg-red-50 p-6 text-red-700">Unable to load tests.</div>;

  return (
    <div className="space-y-3">
      {tests.length === 0 && <Card><CardContent className="p-10 text-center text-gray-500">No tests have been created yet.</CardContent></Card>}
      {tests.map(test => (
        <Card key={test.id}>
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-serif text-lg">{test.title}</h2>
              <p className="text-sm text-gray-500">{test.description || 'No description'}</p>
              <div className="mt-2 text-xs text-gray-500">{test.exerciseCount} exercises · {test.totalPoints} points</div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="default" size="sm"><Link href={`/admin/tests/try/${test.id}`}><Play className="mr-1 h-4 w-4" />Try</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href={`/admin/tests/edit/${test.id}`}><Edit className="mr-1 h-4 w-4" />Edit</Link></Button>
              <Button variant="ghost" size="sm" disabled={deleting} onClick={() => remove(test.id, test.title)}><Trash2 className="mr-1 h-4 w-4 text-red-600" />Delete</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
