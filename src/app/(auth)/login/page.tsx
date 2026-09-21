'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/src/services/firebase';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { PageLoading } from '@/src/components/ui/page-loading';
import { AuthScreen } from '../auth-screen';
import { useAuth } from '@/src/hooks/useAuth';
import {
  isExpectedSignInError,
  recordAuthBreadcrumb,
  reportAuthIssue,
  watchAuthStage,
} from '@/src/lib/auth-diagnostics';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const { user, loading: authLoading, isAdmin } = useAuth();
  const latestAuth = useRef({ user, authLoading });
  latestAuth.current = { user, authLoading };
  const cancelDiagnostic = useRef<(() => void) | null>(null);
  const attemptNumber = useRef(0);
  const redirectRequested = useRef(false);

  useEffect(
    () => () => {
      attemptNumber.current += 1;
      cancelDiagnostic.current?.();
    },
    []
  );

  useEffect(() => {
    if (user && !authLoading) {
      redirectRequested.current = true;
      recordAuthBreadcrumb('redirect_requested', { destination: isAdmin ? '/admin' : '/dashboard' });
      if (isAdmin) {
        router.replace('/admin');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, isAdmin, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    cancelDiagnostic.current?.();
    const attempt = ++attemptNumber.current;
    redirectRequested.current = false;
    const startedAt = Date.now();
    const getDiagnosticDetails = () => ({
      firebaseUserPresent: !!auth.currentUser,
      authLoading: latestAuth.current.authLoading,
      profileLoaded: !!latestAuth.current.user,
      profileMatchesAuthUser: !!auth.currentUser && latestAuth.current.user?.uid === auth.currentUser.uid,
      redirectRequested: redirectRequested.current,
    });
    recordAuthBreadcrumb('sign_in_started', getDiagnosticDetails());
    cancelDiagnostic.current = watchAuthStage('sign_in_request_timeout', getDiagnosticDetails);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (attempt === attemptNumber.current) {
        cancelDiagnostic.current?.();
        recordAuthBreadcrumb('credentials_accepted', { elapsedMs: Date.now() - startedAt, ...getDiagnosticDetails() });
        // This also watches repeated sign-ins for the same Firebase user, which
        // do not fire onAuthStateChanged again after a profile listener stalls.
        cancelDiagnostic.current = watchAuthStage(
          'sign_in_not_completed',
          () => ({
            ...getDiagnosticDetails(),
            credentialsAccepted: true,
          }),
          credential.user.uid
        );
      }
      toast.success('Successfully logged in!');
    } catch (error: unknown) {
      if (attempt === attemptNumber.current) {
        cancelDiagnostic.current?.();
        recordAuthBreadcrumb('sign_in_failed', { elapsedMs: Date.now() - startedAt }, error);
        if (!isExpectedSignInError(error)) reportAuthIssue('sign_in_failed', getDiagnosticDetails(), error);
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to log in. Please check your credentials.';
      toast.error(errorMessage);
    } finally {
      setFormLoading(false);
    }
  };

  if (authLoading || user) {
    return <PageLoading />;
  }

  return (
    <AuthScreen
      title="Welcome back"
      description="Sign in to access your account"
      showLogo
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-primary hover:underline font-medium">
            Sign up
          </Link>
        </>
      }>
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="bg-background"
          />
        </div>
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="bg-background"
          />
        </div>
        <div className="flex items-center justify-end">
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={formLoading}>
          {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {formLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </AuthScreen>
  );
}
