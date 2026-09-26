'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/src/services/firebase';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { PageLoading } from '@/src/components/ui/page-loading';
import { AuthScreen } from '../auth-screen';
import { useAuth } from '@/src/hooks/useAuth';
import { getAuthErrorMessage } from '@/src/lib/auth-errors';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (user && !authLoading) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent! Check your inbox.');
      setEmail('');
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error, 'password-reset'));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return <PageLoading />;
  }

  return (
    <AuthScreen
      title="Reset your password"
      description="Enter your email address and we'll send you a link to reset your password"
      footer={
        <>
          Remember your password?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </>
      }>
      <form onSubmit={handleResetPassword} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="bg-background"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? 'Sending reset link...' : 'Send reset link'}
        </Button>
      </form>
    </AuthScreen>
  );
}
