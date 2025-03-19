'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { signOut } from 'firebase/auth';
import { auth, functions } from '@/src/services/firebase';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useSelector((state: RootState) => state.auth);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [loadingEnv, setLoadingEnv] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/login');
      toast.success('Successfully logged out!');
    } catch {
      toast.error('Failed to log out. Please try again.');
    }
  };

  const fetchEnvironment = async () => {
    setLoadingEnv(true);
    try {
      console.log('functions');
      const getEnvironment = httpsCallable<unknown, { environment: string }>(functions, 'environment');
      console.log('got env');
      const result = await getEnvironment();
      console.log('result', result);
      setEnvironment(result.data.environment);
      toast.success('Environment loaded!');
    } catch (error) {
      console.error('Error fetching environment:', error);
      toast.error('Failed to fetch environment');
    } finally {
      setLoadingEnv(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <Button onClick={handleSignOut}>Sign out</Button>
        </div>

        <div className="bg-card p-6 rounded-lg shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome!</h2>
          <p className="text-muted-foreground">You&apos;re signed in as: {user.email}</p>
          <p className="mt-4">This is a barebones dashboard page. Add your content here!</p>
        </div>

        <div className="bg-card p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Environment</h2>
          <div className="flex items-center space-x-4">
            <Button onClick={fetchEnvironment} disabled={loadingEnv} variant="outline">
              {loadingEnv ? 'Loading...' : 'Check Environment'}
            </Button>
            {environment && (
              <div className="px-3 py-1 bg-primary/10 rounded-md text-primary font-medium">{environment}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
