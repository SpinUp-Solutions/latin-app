'use client';

import React from 'react';
import Link from 'next/link';
import { Edit, Loader2, Play } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { useGetTestsQuery } from '@/src/store/api/testApi';

export function TestManager() {
  const { data: tests = [], isLoading, isError } = useGetTestsQuery();

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );
  if (isError)
    return <div className="rounded-md border border-red-200 bg-red-50 p-6 text-red-700">Unable to load tests.</div>;

  return (
    <div className="space-y-3">
      {tests.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-gray-500">No tests have been created yet.</CardContent>
        </Card>
      )}
      {tests.map(test => (
        <Card key={test.id}>
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-serif text-lg">{test.title}</h2>
              <p className="text-sm text-gray-500">{test.description || 'No description'}</p>
              <div className="mt-2 text-xs text-gray-500">
                {test.rotationVersionCount} {test.rotationVersionCount === 1 ? 'version' : 'versions'} ·{' '}
                {test.minTotalPoints === test.maxTotalPoints
                  ? `${test.minTotalPoints} points`
                  : `${test.minTotalPoints}–${test.maxTotalPoints} points`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="default" size="sm">
                <Link href={`/admin/tests/try/${test.id}`}>
                  <Play className="mr-1 h-4 w-4" />
                  Try
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/tests/edit/${test.id}`}>
                  <Edit className="mr-1 h-4 w-4" />
                  Edit
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
