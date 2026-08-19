'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { TestResultReviewView } from '@/src/components/ui/test-results/test-result-review';
import { useAuth } from '@/src/hooks/useAuth';
import { useGetTestResultQuery } from '@/src/store/api/testApi';

export default function TestResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = React.use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    data: result,
    isLoading: resultLoading,
    isError: resultError,
    refetch: refetchResult,
  } = useGetTestResultQuery(attemptId, { skip: !user?.uid });

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, router, user]);

  if (authLoading || resultLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble">
        <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-roman-red" />
      </div>
    );
  }

  if (!user) return null;

  if (resultError || !result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-roman-marble p-6">
        <Card className="max-w-lg">
          <CardContent className="space-y-4 p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
            <h1 className="font-serif text-2xl">Result unavailable</h1>
            <p className="text-gray-600">
              This test result could not be loaded. It may belong to another account or the attempt may not have been
              submitted.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button variant="outline" type="button" onClick={() => void refetchResult()}>
                Retry
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <TestResultReviewView result={result} />;
}
