'use client';

import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/src/services/firebase';
import { setUser, CustomUser, FirestoreUserDataSchema } from '@/src/store/slices/authSlice';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch();

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    let docTimeout: ReturnType<typeof setTimeout> | null = null;

    const cleanupDoc = () => {
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }
      if (docTimeout) {
        clearTimeout(docTimeout);
        docTimeout = null;
      }
    };

    const unsubAuth = onAuthStateChanged(auth, firebaseUser => {
      cleanupDoc();

      if (firebaseUser) {
        // Use onSnapshot instead of getDoc so we react immediately when
        // the Firestore user doc is created (fixes race during registration
        // where onAuthStateChanged fires before the doc is written).
        unsubDoc = onSnapshot(doc(db, 'users', firebaseUser.uid), snapshot => {
          if (docTimeout) {
            clearTimeout(docTimeout);
            docTimeout = null;
          }

          const rawData = snapshot.data();
          if (!rawData) {
            // Doc doesn't exist yet — keep loading, but give up after 10s
            docTimeout = setTimeout(() => dispatch(setUser(null)), 10000);
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
        });
      } else {
        dispatch(setUser(null));
      }
    });

    return () => {
      unsubAuth();
      cleanupDoc();
    };
  }, [dispatch]);

  return <>{children}</>;
}
