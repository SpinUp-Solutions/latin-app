import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { auth } from '@/src/services/firebase';

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
