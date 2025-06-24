'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useSelector } from 'react-redux';
import { auth, db } from '@/src/services/firebase';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { toast } from 'sonner';
import { doc, setDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { RootState } from '@/src/store';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (user && !authLoading) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email,
        role: isTeacher ? 'teacher' : 'student',
        createdAt: new Date().toISOString(),
      });

      toast.success('Account created! Please wait while we redirect you.');
    } catch (error: unknown) {
      console.error('Registration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create account. Please try again.';
      toast.error(errorMessage);
    } finally {
      setFormLoading(false);
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
            <h2 className="text-2xl font-bold font-serif">Create an account</h2>
            <p className="text-muted-foreground">Sign up to get started with our platform</p>
          </RomanCardHeader>
          <RomanCardContent>
            <form onSubmit={handleRegister} className="space-y-4">
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
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="bg-background"
                />
              </div>
              <div className="flex flex-col items-center space-y-2 pt-2">
                <div className="flex items-center rounded-lg border p-1 bg-background">
                  <Button
                    type="button"
                    variant={!isTeacher ? 'default' : 'ghost'}
                    onClick={() => setIsTeacher(false)}
                    className="rounded-r-none"
                    size="sm">
                    Student
                  </Button>
                  <Button
                    type="button"
                    variant={isTeacher ? 'default' : 'ghost'}
                    onClick={() => setIsTeacher(true)}
                    className="rounded-l-none"
                    size="sm">
                    Teacher
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={formLoading}>
                {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {formLoading ? 'Creating account...' : 'Create account'}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground w-full">
              Already have an account?{' '}
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
