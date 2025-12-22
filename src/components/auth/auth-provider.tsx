'use client';

import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/src/services/firebase';
import { setUser, CustomUser, FirestoreUserDataSchema } from '@/src/store/slices/authSlice';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        const rawData = userDoc.data();

        if (!rawData) {
          dispatch(setUser(null));
          return;
        }

        const parseResult = FirestoreUserDataSchema.safeParse(rawData);

        const customUser: CustomUser = {
          ...firebaseUser,
          role: parseResult.success ? parseResult.data.role : 'student',
          username: parseResult.success ? parseResult.data.username : '',
          firstName: parseResult.success ? parseResult.data.firstName : '',
          lastName: parseResult.success ? parseResult.data.lastName : '',
          dateOfBirth: parseResult.success ? parseResult.data.dateOfBirth : '',
        };

        dispatch(setUser(customUser));
      } else {
        dispatch(setUser(null));
      }
    });

    return () => unsubscribe();
  }, [dispatch]);

  return <>{children}</>;
}
