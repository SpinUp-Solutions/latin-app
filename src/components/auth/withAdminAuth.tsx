import React from 'react';
import { useRequireAdmin } from '@/src/hooks/useAuth';
import { AdminLoadingPage } from '@/src/components/ui/admin/AdminLoadingPage';

export function withAdminAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AdminProtected(props: P) {
    const { user, loading, isAdmin } = useRequireAdmin();

    if (loading || !user) {
      return <AdminLoadingPage />;
    }

    if (!isAdmin) {
      return null;
    }

    return <Component {...props} />;
  };
}