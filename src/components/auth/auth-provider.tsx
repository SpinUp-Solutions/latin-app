'use client';

import React, { useEffect, useRef } from 'react';
import * as Sentry from '@sentry/nextjs';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/src/services/firebase';
import { setAuthUid, setUser, CustomUser, FirestoreUserDataSchema } from '@/src/store/slices/authSlice';
import { appApi } from '@/src/store/api/appApi';
import {
  clearPersistedStudentDashboard,
  resetStudentDashboardCacheSeed,
  seedStudentDashboardCache,
} from '@/src/store/api/dashboardCache';
import { useAppDispatch } from '@/src/store/hooks';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const authenticatedUid = useRef<string | null | undefined>(undefined);

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

      const nextUid = firebaseUser?.uid ?? null;
      const previousUid = authenticatedUid.current;
      if (previousUid !== undefined && previousUid !== nextUid) {
        dispatch(appApi.util.resetApiState());
        if (previousUid) clearPersistedStudentDashboard(previousUid);
        resetStudentDashboardCacheSeed();
      }
      authenticatedUid.current = nextUid;

      // The uid is dispatched immediately so data queries can start while the
      // profile snapshot is still loading, instead of after it.
      dispatch(setAuthUid(nextUid));

      if (firebaseUser) {
        Sentry.setUser({ id: firebaseUser.uid });

        // The persisted dashboard is rehydrated now and revalidated in the
        // background, giving returning students an instant dashboard paint.
        dispatch(seedStudentDashboardCache(firebaseUser.uid));

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
        Sentry.setUser(null);
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
