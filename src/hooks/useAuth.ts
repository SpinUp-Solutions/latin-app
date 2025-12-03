import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { RootState } from '@/src/store';
import { toast } from 'sonner';

export function useAuth() {
  const { user, loading } = useSelector((state: RootState) => state.auth);

  const getDisplayName = (): string => {
    if (!user) return '';
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`.trim();
    }
    if (user.firstName) return user.firstName;
    if (user.username) return user.username;
    return user.email?.split('@')[0] ?? '';
  };

  return {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isTeacher: user?.role === 'teacher',
    isStudent: user?.role === 'student',
    displayName: getDisplayName(),
    isProfileComplete: !!(user?.username && user?.firstName && user?.lastName && user?.dateOfBirth),
  };
}

export function useRequireAdmin() {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/dashboard');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [user, loading, isAdmin, router]);

  return { user, loading, isAdmin };
}
