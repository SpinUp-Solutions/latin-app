import { auth } from '@/src/services/firebase';
import { useAuth } from './useAuth';

export class AdminApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.payload = payload;
  }
}

const getErrorMessage = (payload: unknown) => {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }

  return 'Admin request failed';
};

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
      const payload: unknown = await response.json().catch(() => null);
      throw new AdminApiError(getErrorMessage(payload), response.status, payload);
    }

    return response.json();
  };

  return { makeAdminRequest };
};
