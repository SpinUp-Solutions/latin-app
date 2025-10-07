import { auth } from '@/src/services/firebase';
import { useAuth } from './useAuth';

export const useAdminApi = () => {
  const { user, isAdmin } = useAuth();

  const makeAdminRequest = async (endpoint: string, options: RequestInit = {}) => {
    if (!user || !isAdmin) {
      throw new Error('Admin access required');
    }

    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('Authentication token not available');
    }

    const isFormData = options.body instanceof FormData;

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);

    if (!isFormData) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`/api/admin/${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Admin request failed');
    }

    return response.json();
  };

  return { makeAdminRequest };
};
