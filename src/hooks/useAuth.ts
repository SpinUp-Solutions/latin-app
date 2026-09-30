import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '@/src/store/hooks';
import { toast } from 'sonner';

export function useAuth() {
  const { user, loading, authUid } = useAppSelector(state => state.auth);

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
    authUid,
    isAdmin: user?.role === 'admin',
    displayName: getDisplayName(),
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
