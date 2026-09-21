'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/src/services/firebase';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { toast } from 'sonner';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { PageLoading } from '@/src/components/ui/page-loading';
import { DateOfBirthField } from '@/src/components/ui/core/date-of-birth-field';
import { useAuth } from '@/src/hooks/useAuth';
import { z } from 'zod';
import { AuthScreen } from '../auth-screen';

const RegistrationSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(20, 'Username must be at most 20 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    firstName: z.string().min(1, 'First name is required').max(50, 'First name is too long'),
    lastName: z.string().min(1, 'Last name is required').max(50, 'Last name is too long'),
    dateOfBirth: z.date({ error: 'Date of birth is required' }),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegistrationFormData = z.infer<typeof RegistrationSchema>;

const checkUsernameAvailable = async (username: string): Promise<boolean> => {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('username', '==', username.toLowerCase()));
  const snapshot = await getDocs(q);
  return snapshot.empty;
};

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (user && !authLoading) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const formData: RegistrationFormData = {
        email,
        password,
        confirmPassword,
        username,
        firstName,
        lastName,
        dateOfBirth: dateOfBirth as Date,
      };

      const validation = RegistrationSchema.safeParse(formData);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        toast.error(firstError.message);
        setFormLoading(false);
        return;
      }

      const isAvailable = await checkUsernameAvailable(username);
      if (!isAvailable) {
        toast.error('Username is already taken. Please choose another.');
        setFormLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email,
          role: 'student',
          username: username.toLowerCase(),
          firstName,
          lastName,
          dateOfBirth: dateOfBirth?.toISOString().split('T')[0] ?? '',
          createdAt: new Date().toISOString(),
        });
      } catch (firestoreError) {
        // Rollback: delete the auth user so they can retry registration
        await userCredential.user.delete();
        throw firestoreError;
      }

      toast.success('Account created!');
      router.replace('/dashboard');
    } catch (error: unknown) {
      console.error('Registration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create account. Please try again.';
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
      title="Create an account"
      description="Sign up to get started with our platform"
      showLogo
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </>
      }>
      <form onSubmit={handleRegister} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            required
            className="bg-background"
          />
          <Input
            type="text"
            placeholder="Last name"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            required
            className="bg-background"
          />
        </div>
        <Input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          className="bg-background"
        />
        <Input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="bg-background"
        />
        <Input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="bg-background"
        />
        <Input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
          className="bg-background"
        />
        <DateOfBirthField
          value={dateOfBirth}
          onChange={setDateOfBirth}
          open={calendarOpen}
          onOpenChange={setCalendarOpen}
        />
        <Button type="submit" className="w-full" disabled={formLoading}>
          {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {formLoading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthScreen>
  );
}
