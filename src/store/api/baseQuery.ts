import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { auth } from '@/src/services/firebase';

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (!isObject(error)) return fallback;

  if (isObject(error.data)) {
    const message = error.data.error ?? error.data.message;
    if (typeof message === 'string') return message;
  }

  if (typeof error.error === 'string') return error.error;
  if (typeof error.message === 'string') return error.message;
  return fallback;
};

export const hasApiErrorStatus = (error: unknown, status: number) => isObject(error) && error.status === status;

export const getApiErrorCode = (error: unknown): string | undefined => {
  if (!isObject(error) || !isObject(error.data)) return undefined;
  return typeof error.data.code === 'string' ? error.data.code : undefined;
};

export const createAuthenticatedBaseQuery = () =>
  fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: async headers => {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        headers.set('authorization', `Bearer ${token}`);
      }
      return headers;
    },
  });
