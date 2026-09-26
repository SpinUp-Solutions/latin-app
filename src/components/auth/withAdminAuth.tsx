import React from 'react';
import { useRequireAdmin } from '@/src/hooks/useAuth';
import { PageLoading } from '@/src/components/ui/page-loading';

export function withAdminAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AdminProtected(props: P) {
    const { user, loading, isAdmin } = useRequireAdmin();

    if (loading || !user) {
      return <PageLoading />;
    }

    if (!isAdmin) {
      return null;
    }

    return <Component {...props} />;
  };
}
