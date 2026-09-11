'use client';

import * as Sentry from '@sentry/nextjs';
import { SDK_VERSION } from 'firebase/app';

export const AUTH_DIAGNOSTIC_TIMEOUT_MS = 15_000;

type AuthDiagnosticDetails = {
  elapsedMs?: number;
  firebaseUserPresent?: boolean;
  authLoading?: boolean;
  profileLoaded?: boolean;
  profileMatchesAuthUser?: boolean;
  credentialsAccepted?: boolean;
  redirectRequested?: boolean;
  snapshotReceived?: boolean;
  profileExists?: boolean;
  fromCache?: boolean;
  hasPendingWrites?: boolean;
  profileValid?: boolean;
  validationIssueCount?: number;
  signedIn?: boolean;
  sameUserAsBefore?: boolean;
  step?: 'dashboard_cache' | 'profile_subscription' | 'profile_snapshot';
  destination?: '/admin' | '/dashboard';
};

const EXPECTED_SIGN_IN_ERRORS = new Set([
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/invalid-email',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/too-many-requests',
]);

// Firebase errors can contain email addresses, credentials and customData.
// Only send a bounded code/name and a classification, never the original error.
function errorDetails(error: unknown) {
  const record = typeof error === 'object' && error !== null ? error : {};
  const code = 'code' in record && typeof record.code === 'string' ? record.code : '';
  const name = 'name' in record && typeof record.name === 'string' ? record.name : '';
  const message = 'message' in record && typeof record.message === 'string' ? record.message : '';
  const errorCode = /^(auth\/)?[a-z][a-z-]{0,60}$/.test(code) ? code : 'unknown';
  const errorName =
    /^(FirebaseError|Error|TypeError|SecurityError|InvalidStateError|QuotaExceededError|AbortError|UnknownError)$/.test(
      name
    )
      ? name
      : 'unknown';
  const errorKind = /already been terminated/i.test(message)
    ? 'client_terminated'
    : /indexeddb|object store|database.*clos/i.test(message)
      ? 'indexeddb'
      : /network|fetch|offline/i.test(message + code)
        ? 'network'
        : /storage|quota|securityerror/i.test(message + name)
          ? 'browser_storage'
          : 'unknown';
  return { errorCode, errorName, errorKind };
}

function browserDetails() {
  let localStorageAccessible = false;
  let indexedDbAccessible = false;
  try {
    localStorageAccessible = typeof window !== 'undefined' && typeof window.localStorage.length === 'number';
  } catch {
    /* A blocked storage API is diagnostic information, not a new failure. */
  }
  try {
    indexedDbAccessible = typeof window !== 'undefined' && !!window.indexedDB;
  } catch {
    /* Some privacy settings throw even when accessing the API. */
  }
  return {
    firebaseSdkVersion: SDK_VERSION,
    online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
    cookiesEnabled: typeof navigator === 'undefined' ? undefined : navigator.cookieEnabled,
    visibilityState: typeof document === 'undefined' ? undefined : document.visibilityState,
    localStorageAccessible,
    indexedDbAccessible,
  };
}

export function recordAuthBreadcrumb(stage: string, details: AuthDiagnosticDetails = {}, error?: unknown): void {
  try {
    Sentry.addBreadcrumb({
      category: 'auth',
      message: stage,
      level: error ? 'warning' : 'info',
      data: { ...details, ...(error ? errorDetails(error) : {}) },
    });
  } catch {
    /* Diagnostics must never interrupt authentication. */
  }
}

export function reportAuthIssue(
  stage: string,
  details: AuthDiagnosticDetails = {},
  error?: unknown,
  uid?: string | null
): void {
  try {
    const safeError = error === undefined ? undefined : errorDetails(error);
    Sentry.withScope(scope => {
      // An anonymous attempt must not inherit another account's Sentry user.
      scope.setUser(uid ? { id: uid } : null);
      Sentry.captureMessage(`Authentication: ${stage}`, {
        level: error === undefined ? 'warning' : 'error',
        tags: {
          surface: 'authentication',
          authStage: stage,
          ...(safeError ? { authErrorCode: safeError.errorCode } : {}),
        },
        fingerprint: ['authentication', stage, safeError?.errorCode ?? 'no_error'],
        user: uid ? { id: uid } : undefined,
        extra: { ...browserDetails(), ...details, ...safeError },
      });
    });
  } catch {
    /* Diagnostics must never interrupt authentication. */
  }
}

export function isExpectedSignInError(error: unknown): boolean {
  return EXPECTED_SIGN_IN_ERRORS.has(errorDetails(error).errorCode);
}

export function watchAuthStage(
  stage: string,
  getDetails: () => AuthDiagnosticDetails,
  uid?: string | null
): () => void {
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    try {
      reportAuthIssue(stage, { ...getDetails(), elapsedMs: Date.now() - startedAt }, undefined, uid);
    } catch {
      reportAuthIssue(stage, { elapsedMs: Date.now() - startedAt }, undefined, uid);
    }
  }, AUTH_DIAGNOSTIC_TIMEOUT_MS);
  return () => clearTimeout(timer);
}
