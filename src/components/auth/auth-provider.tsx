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
import { recordAuthBreadcrumb, reportAuthIssue, watchAuthStage } from '@/src/lib/auth-diagnostics';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const authenticatedUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    let docTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelProfileWatch: (() => void) | null = null;
    let profileSession = 0;
    let stopped = false;
    const cancelAuthWatch = watchAuthStage('auth_state_timeout', () => ({ firebaseUserPresent: !!auth.currentUser }));

    const cleanupDoc = () => {
      profileSession += 1;
      cancelProfileWatch?.();
      cancelProfileWatch = null;
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }
      if (docTimeout) {
        clearTimeout(docTimeout);
        docTimeout = null;
      }
    };

    const handleAuthError = (error: unknown) => {
      if (stopped) return;
      cancelAuthWatch();
      cleanupDoc();
      reportAuthIssue(
        'auth_state_listener_error',
        { firebaseUserPresent: !!auth.currentUser },
        error,
        auth.currentUser?.uid
      );
    };

    let unsubAuth = () => {};
    try {
      unsubAuth = onAuthStateChanged(
        auth,
        firebaseUser => {
          if (stopped) return;
          cancelAuthWatch();
          cleanupDoc();

          const nextUid = firebaseUser?.uid ?? null;
          const previousUid = authenticatedUid.current;
          recordAuthBreadcrumb('auth_state_changed', {
            signedIn: !!nextUid,
            sameUserAsBefore: previousUid === nextUid,
          });
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
            const session = profileSession;
            const isCurrent = () => !stopped && profileSession === session;
            let snapshotReceived = false;
            let snapshotDetails: { profileExists?: boolean; fromCache?: boolean; hasPendingWrites?: boolean } = {};
            let invalidProfileReported = false;
            let profileFailureReported = false;
            const getProfileDetails = () => ({
              snapshotReceived,
              ...snapshotDetails,
              firebaseUserPresent: !!auth.currentUser,
            });
            cancelProfileWatch = watchAuthStage('profile_timeout', getProfileDetails, firebaseUser.uid);
            const profileError = (stage: string, error: unknown) => {
              if (!isCurrent()) return;
              cancelProfileWatch?.();
              profileFailureReported = true;
              reportAuthIssue(stage, getProfileDetails(), error, firebaseUser.uid);
            };
            let step: 'dashboard_cache' | 'profile_subscription' = 'dashboard_cache';

            try {
              // The persisted dashboard is rehydrated now and revalidated in the
              // background, giving returning students an instant dashboard paint.
              dispatch(seedStudentDashboardCache(firebaseUser.uid));
              step = 'profile_subscription';
              recordAuthBreadcrumb('profile_subscription_started');

              // Use onSnapshot instead of getDoc so we react immediately when
              // the Firestore user doc is created (fixes race during registration
              // where onAuthStateChanged fires before the doc is written).
              unsubDoc = onSnapshot(
                doc(db, 'users', firebaseUser.uid),
                snapshot => {
                  if (!isCurrent()) return;
                  try {
                    if (docTimeout) {
                      clearTimeout(docTimeout);
                      docTimeout = null;
                    }

                    const rawData = snapshot.data();
                    snapshotReceived = true;
                    snapshotDetails = {
                      profileExists: !!rawData,
                      fromCache: snapshot.metadata.fromCache,
                      hasPendingWrites: snapshot.metadata.hasPendingWrites,
                    };
                    profileFailureReported = false;
                    recordAuthBreadcrumb('profile_snapshot_received', getProfileDetails());
                    if (!rawData) {
                      // Doc doesn't exist yet — keep loading, but give up after 10s
                      docTimeout = setTimeout(() => {
                        if (!isCurrent()) return;
                        cancelProfileWatch?.();
                        if (!profileFailureReported) {
                          reportAuthIssue('profile_unavailable', getProfileDetails(), undefined, firebaseUser.uid);
                        }
                        dispatch(setUser(null));
                      }, 10000);
                      return;
                    }

                    const parseResult = FirestoreUserDataSchema.safeParse(rawData);
                    if (!parseResult.success && !invalidProfileReported) {
                      invalidProfileReported = true;
                      reportAuthIssue(
                        'profile_invalid',
                        {
                          ...getProfileDetails(),
                          validationIssueCount: parseResult.error.issues.length,
                        },
                        undefined,
                        firebaseUser.uid
                      );
                    }

                    const customUser: CustomUser = {
                      ...firebaseUser,
                      role: parseResult.success ? parseResult.data.role : 'student',
                      username: parseResult.success ? parseResult.data.username : '',
                      firstName: parseResult.success ? parseResult.data.firstName : '',
                      lastName: parseResult.success ? parseResult.data.lastName : '',
                      dateOfBirth: parseResult.success ? parseResult.data.dateOfBirth : '',
                    };

                    dispatch(setUser(customUser));
                    cancelProfileWatch?.();
                    recordAuthBreadcrumb('profile_loaded', {
                      ...getProfileDetails(),
                      profileValid: parseResult.success,
                    });
                  } catch (error) {
                    profileError('profile_snapshot_error', error);
                  }
                },
                error => profileError('profile_listener_error', error)
              );
            } catch (error) {
              cancelProfileWatch?.();
              reportAuthIssue('profile_setup_error', { ...getProfileDetails(), step }, error, firebaseUser.uid);
            }
          } else {
            Sentry.setUser(null);
            dispatch(setUser(null));
          }
        },
        handleAuthError
      );
    } catch (error) {
      handleAuthError(error);
    }

    return () => {
      stopped = true;
      cancelAuthWatch();
      unsubAuth();
      cleanupDoc();
    };
  }, [dispatch]);

  return <>{children}</>;
}
