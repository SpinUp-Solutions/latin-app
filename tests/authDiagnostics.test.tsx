import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { addBreadcrumb, captureMessage, setUser as setSentryUser } from '@sentry/nextjs';
import { onAuthStateChanged, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { auth } from '@/src/services/firebase';
import { AuthProvider } from '@/src/components/auth/auth-provider';
import LoginPage from '@/src/app/(auth)/login/page';
import authReducer from '@/src/store/slices/authSlice';
import { AUTH_DIAGNOSTIC_TIMEOUT_MS } from '@/src/lib/auth-diagnostics';

const router = { replace: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => router }));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('firebase/app', () => ({ SDK_VERSION: 'test-firebase-version' }));
jest.mock('@/src/services/firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(() => ({})), onSnapshot: jest.fn() }));
jest.mock('@/src/store/api/appApi', () => ({
  appApi: { util: { resetApiState: () => ({ type: 'test/reset-api' }) } },
}));
jest.mock('@/src/store/api/dashboardCache', () => ({
  seedStudentDashboardCache: () => ({ type: 'test/seed-dashboard' }),
  clearPersistedStudentDashboard: jest.fn(),
  resetStudentDashboardCacheSeed: jest.fn(),
}));

type Snapshot = { data: () => unknown; metadata: { fromCache: boolean; hasPendingWrites: boolean } };
type CapturedEvent = {
  tags: { authStage: string; surface: string };
  extra: Record<string, unknown>;
  user?: { id?: string };
};
const mockAuth = auth as unknown as { currentUser: User | null };
const events = () => (captureMessage as jest.Mock).mock.calls as [string, CapturedEvent][];
const eventAt = (stage: string) => events().find(([, event]) => event.tags.authStage === stage)?.[1];

describe('authentication diagnostics through the login page and auth provider', () => {
  let authListener: (user: User | null) => void;
  let authError: (error: unknown) => void;
  let profileListener: (snapshot: Snapshot) => void;
  let profileError: (error: unknown) => void;
  let unsubscribeProfile: jest.Mock;
  const firebaseUser = { uid: 'student-1', email: 'private-student@example.com' } as User;
  const validProfile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    role: 'student',
    firstName: 'Private first name',
    dateOfBirth: '2000-01-01',
  };

  function renderAuth(login = false) {
    const store = configureStore({ reducer: { auth: authReducer } });
    const rendered = render(
      <Provider store={store}>
        <AuthProvider>{login ? <LoginPage /> : <div>App</div>}</AuthProvider>
      </Provider>
    );
    return { ...rendered, store };
  }

  function emitAuth(user: User | null) {
    act(() => {
      mockAuth.currentUser = user;
      authListener(user);
    });
  }

  function emitProfile(data: unknown = validProfile, fromCache = false) {
    act(() => profileListener({ data: () => data, metadata: { fromCache, hasPendingWrites: false } }));
  }

  async function submitLogin() {
    fireEvent.change(screen.getByPlaceholderText('name@example.com'), { target: { value: firebaseUser.email } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'private-password-sentinel' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAuth.currentUser = null;
    unsubscribeProfile = jest.fn();
    (onAuthStateChanged as jest.Mock).mockImplementation((_auth, next, error) => {
      authListener = next;
      authError = error;
      return jest.fn();
    });
    (onSnapshot as jest.Mock).mockImplementation((_ref, next, error) => {
      profileListener = next;
      profileError = error;
      return unsubscribeProfile;
    });
    (signInWithEmailAndPassword as jest.Mock).mockImplementation(async () => {
      mockAuth.currentUser = firebaseUser;
      authListener(firebaseUser);
      return { user: firebaseUser };
    });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('records a profile listener that never responds after a successful password check', async () => {
    renderAuth(true);
    emitAuth(null);
    await submitLogin();
    expect(toast.success).toHaveBeenCalledWith('Successfully logged in!');
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(captureMessage).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(eventAt('profile_timeout')).toEqual(
      expect.objectContaining({
        user: { id: firebaseUser.uid },
        extra: expect.objectContaining({ snapshotReceived: false, firebaseUserPresent: true }),
      })
    );
    expect(eventAt('sign_in_not_completed')?.extra).toEqual(
      expect.objectContaining({
        credentialsAccepted: true,
        profileLoaded: false,
        redirectRequested: false,
        profileMatchesAuthUser: false,
        elapsedMs: AUTH_DIAGNOSTIC_TIMEOUT_MS,
      })
    );
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS * 5));
    expect(events()).toHaveLength(2);
    const recorded = JSON.stringify([events(), (addBreadcrumb as jest.Mock).mock.calls]);
    for (const secret of [
      firebaseUser.email,
      'private-password-sentinel',
      validProfile.firstName,
      validProfile.dateOfBirth,
    ]) {
      expect(recorded).not.toContain(secret);
    }
  });

  it('records repeated sign-ins even when Firebase does not emit another auth-state change', async () => {
    renderAuth(true);
    emitAuth(null);
    await submitLogin();
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    (captureMessage as jest.Mock).mockClear();
    (signInWithEmailAndPassword as jest.Mock).mockResolvedValue({ user: firebaseUser });
    await submitLogin();
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
    expect(eventAt('sign_in_not_completed')?.extra.credentialsAccepted).toBe(true);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('records cached profile readiness and navigation without reporting a healthy sign-in', async () => {
    const { unmount, store } = renderAuth(true);
    emitAuth(null);
    await submitLogin();
    emitProfile(validProfile, true);
    expect(store.getState().auth.user?.uid).toBe(firebaseUser.uid);
    expect(router.replace).toHaveBeenCalledWith('/dashboard');
    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'profile_loaded',
        data: expect.objectContaining({ fromCache: true, profileValid: true }),
      })
    );
    unmount();
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS * 2));
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('distinguishes a stuck redirect from a missing profile', async () => {
    renderAuth(true);
    emitAuth(null);
    await submitLogin();
    emitProfile();
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
    expect(eventAt('sign_in_not_completed')?.extra).toEqual(
      expect.objectContaining({
        profileLoaded: true,
        profileMatchesAuthUser: true,
        redirectRequested: true,
      })
    );
  });

  it('reports a password request that never settles', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockReturnValue(new Promise(() => {}));
    renderAuth(true);
    emitAuth(null);
    await submitLogin();
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
    expect(eventAt('sign_in_request_timeout')?.extra.firebaseUserPresent).toBe(false);
  });

  it('does not start a new timer when a sign-in promise resolves after unmount', async () => {
    let resolveSignIn!: (value: { user: User }) => void;
    (signInWithEmailAndPassword as jest.Mock).mockReturnValue(
      new Promise(resolve => {
        resolveSignIn = resolve;
      })
    );
    const { unmount } = renderAuth(true);
    emitAuth(null);
    await submitLogin();
    unmount();
    await act(async () => resolveSignIn({ user: firebaseUser }));
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS * 2));
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it.each(['auth/invalid-credential', 'auth/wrong-password', 'auth/too-many-requests'])(
    'keeps %s as a breadcrumb instead of opening an issue',
    async code => {
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
        code,
        message: 'private-error',
        customData: { password: 'secret' },
      });
      renderAuth(true);
      emitAuth(null);
      await submitLogin();
      act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
      expect(captureMessage).not.toHaveBeenCalled();
      expect(addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'sign_in_failed', data: expect.objectContaining({ errorCode: code }) })
      );
      expect(JSON.stringify((addBreadcrumb as jest.Mock).mock.calls)).not.toMatch(/private-error|secret/);
    }
  );

  it('shows a user-friendly toast instead of raw Firebase errors on sign-in failure', async () => {
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue({
      code: 'auth/invalid-credential',
      message: 'Firebase: Error (auth/invalid-credential).',
    });
    renderAuth(true);
    emitAuth(null);
    await submitLogin();
    expect(toast.error).toHaveBeenCalledWith('Incorrect email or password. Please try again.');
    expect(JSON.stringify((toast.error as jest.Mock).mock.calls)).not.toMatch(/Firebase|auth\//);
  });

  it('reports network failures without serializing error messages, stack or customData', async () => {
    const error = Object.assign(new Error('Failed to fetch private-token-sentinel'), {
      code: 'auth/network-request-failed',
      customData: { email: firebaseUser.email, password: 'private-password-sentinel' },
    });
    (signInWithEmailAndPassword as jest.Mock).mockRejectedValue(error);
    renderAuth(true);
    emitAuth(null);
    await submitLogin();
    expect(eventAt('sign_in_failed')?.extra).toEqual(
      expect.objectContaining({ errorCode: error.code, errorKind: 'network' })
    );
    expect(setSentryUser).toHaveBeenLastCalledWith(null);
    const recorded = JSON.stringify([events(), (addBreadcrumb as jest.Mock).mock.calls]);
    expect(recorded).not.toMatch(/private-token-sentinel|private-password-sentinel|private-student|customData|stack/);
  });

  it('reports missing profile metadata and preserves delayed-registration recovery', () => {
    const { store } = renderAuth();
    emitAuth(firebaseUser);
    act(() => profileListener({ data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } }));
    act(() => jest.advanceTimersByTime(10_000));
    expect(eventAt('profile_unavailable')?.extra).toEqual(
      expect.objectContaining({ profileExists: false, fromCache: true })
    );
    expect(store.getState().auth.user).toBeNull();
    emitProfile();
    expect(store.getState().auth.user?.uid).toBe(firebaseUser.uid);
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
  });

  it('allows registration to create a missing profile before the timeout without an issue', () => {
    renderAuth();
    emitAuth(firebaseUser);
    act(() => profileListener({ data: () => undefined, metadata: { fromCache: false, hasPendingWrites: false } }));
    act(() => jest.advanceTimersByTime(5_000));
    emitProfile();
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reports malformed profiles once while preserving the existing compatibility defaults', () => {
    const { store } = renderAuth();
    emitAuth(firebaseUser);
    emitProfile({ ...validProfile, role: 'invalid-private-role' });
    emitProfile({ ...validProfile, role: 'invalid-private-role' });
    expect(store.getState().auth.user?.role).toBe('student');
    expect(events()).toHaveLength(1);
    expect(eventAt('profile_invalid')?.extra.validationIssueCount).toBe(1);
    expect(JSON.stringify(events())).not.toMatch(/invalid-private-role|Private first name|2000-01-01/);
  });

  it('reports synchronous subscription failures, including a terminated Firestore client', () => {
    (onSnapshot as jest.Mock).mockImplementation(() => {
      throw Object.assign(new Error('The client has already been terminated.'), { code: 'failed-precondition' });
    });
    renderAuth();
    emitAuth(firebaseUser);
    expect(eventAt('profile_setup_error')?.extra).toEqual(
      expect.objectContaining({ step: 'profile_subscription', errorKind: 'client_terminated' })
    );
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
  });

  it('records terminal listener errors once and preserves the existing missing-profile timeout', () => {
    const { store } = renderAuth();
    emitAuth(firebaseUser);
    act(() => profileListener({ data: () => undefined, metadata: { fromCache: true, hasPendingWrites: false } }));
    act(() => profileError({ code: 'permission-denied', message: 'private details' }));
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
    expect(eventAt('profile_listener_error')?.extra.errorCode).toBe('permission-denied');
    expect(store.getState().auth.loading).toBe(false);
  });

  it('cancels stale diagnostics and snapshots when the account changes or signs out', () => {
    const { store } = renderAuth();
    emitAuth(firebaseUser);
    const staleSnapshot = profileListener;
    const staleError = profileError;
    emitAuth({ ...firebaseUser, uid: 'student-2' });
    act(() => staleSnapshot({ data: () => validProfile, metadata: { fromCache: true, hasPendingWrites: false } }));
    act(() => staleError({ code: 'permission-denied' }));
    expect(store.getState().auth.user).toBeNull();
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
    expect(eventAt('profile_timeout')?.user).toEqual({ id: 'student-2' });
    emitAuth(null);
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
    expect(unsubscribeProfile).toHaveBeenCalledTimes(2);
  });

  it('reports auth initialization that never emits and cancels after an auth callback', () => {
    renderAuth();
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(eventAt('auth_state_timeout')).toBeDefined();
    emitAuth(null);
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
  });

  it('records auth observer errors without leaving a timeout behind', () => {
    renderAuth();
    act(() => authError({ code: 'auth/network-request-failed' }));
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(events()).toHaveLength(1);
    expect(eventAt('auth_state_listener_error')).toBeDefined();
  });

  it('can report a stall when the browser blocks access to localStorage', () => {
    jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    renderAuth();
    emitAuth(firebaseUser);
    act(() => jest.advanceTimersByTime(AUTH_DIAGNOSTIC_TIMEOUT_MS));
    expect(eventAt('profile_timeout')?.extra.localStorageAccessible).toBe(false);
  });

  it('keeps authentication working if Sentry throws', async () => {
    (addBreadcrumb as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Sentry unavailable');
    });
    const { store } = renderAuth(true);
    emitAuth(null);
    await submitLogin();
    emitProfile();
    expect(store.getState().auth.user?.uid).toBe(firebaseUser.uid);
    expect(router.replace).toHaveBeenCalledWith('/dashboard');
  });
});
