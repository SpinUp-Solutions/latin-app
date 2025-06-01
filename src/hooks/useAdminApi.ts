import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { auth } from '@/src/services/firebase';

export const useAdminApi = () => {
  const { user } = useSelector((state: RootState) => state.auth);

  const makeAdminRequest = async (endpoint: string, options: RequestInit = {}) => {
    if (!user || user.role !== 'admin') {
      throw new Error('Admin access required');
    }

    // Get current user token
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('Authentication token not available');
    }

    const response = await fetch(`/api/admin/${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Admin request failed');
    }

    return response.json();
  };

  return { makeAdminRequest };
};
