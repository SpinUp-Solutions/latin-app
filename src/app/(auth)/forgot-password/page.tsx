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
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { useAuth } from '@/src/hooks/useAuth';

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
    } catch {
      toast.error('Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <Loader2 className="h-8 w-8 animate-spin text-roman-red" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/20 p-4">
      <div className="relative w-full max-w-md">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 blur-3xl -z-10 transform rotate-45"></div>
        <RomanCard className="shadow-xl">
          <RomanCardHeader className="space-y-1 text-center">
            <h2 className="text-2xl font-bold font-serif">Reset your password</h2>
            <p className="text-muted-foreground">
              Enter your email address and we&apos;ll send you a link to reset your password
            </p>
          </RomanCardHeader>
          <RomanCardContent>
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
            <p className="mt-6 text-center text-sm text-muted-foreground w-full">
              Remember your password?{' '}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </RomanCardContent>
        </RomanCard>
      </div>
    </div>
  );
}
