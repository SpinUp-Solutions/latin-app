import { getAuthErrorMessage } from '@/src/lib/auth-errors';

describe('getAuthErrorMessage', () => {
  it.each([
    ['auth/invalid-credential', 'sign-in', 'Incorrect email or password. Please try again.'],
    ['auth/wrong-password', 'sign-in', 'Incorrect email or password. Please try again.'],
    ['auth/user-not-found', 'sign-in', 'Incorrect email or password. Please try again.'],
    ['auth/too-many-requests', 'sign-in', 'Too many attempts. Please wait a few minutes and try again.'],
    ['auth/network-request-failed', 'sign-in', 'Unable to connect. Check your internet connection and try again.'],
    ['auth/email-already-in-use', 'registration', 'An account with this email already exists. Try signing in instead.'],
    ['auth/weak-password', 'registration', 'Password is too weak. Please choose a stronger password with at least 8 characters.'],
    ['auth/invalid-email', 'password-reset', 'Please enter a valid email address.'],
    ['auth/missing-email', 'password-reset', 'Please enter your email address.'],
  ] as const)('maps %s in %s context', (code, context, expected) => {
    expect(getAuthErrorMessage({ code, message: `Firebase: Error (${code}).` }, context)).toBe(expected);
  });

  it('uses password-change specific messages', () => {
    expect(getAuthErrorMessage({ code: 'auth/wrong-password' }, 'password-change')).toBe(
      'Current password is incorrect.'
    );
    expect(getAuthErrorMessage({ code: 'auth/weak-password' }, 'password-change')).toBe(
      'New password is too weak. Please choose a stronger one.'
    );
  });

  it('never exposes raw Firebase error messages', () => {
    const message = getAuthErrorMessage(
      { code: 'auth/invalid-credential', message: 'Firebase: Error (auth/invalid-credential).' },
      'sign-in'
    );
    expect(message).not.toContain('Firebase');
    expect(message).not.toContain('auth/');
  });

  it('returns context-specific fallbacks for unknown errors', () => {
    expect(getAuthErrorMessage(new Error('internal failure'), 'sign-in')).toBe(
      'Unable to sign in. Please check your credentials and try again.'
    );
    expect(getAuthErrorMessage({ code: 'auth/unknown-code' }, 'registration')).toBe(
      'Unable to create your account. Please try again.'
    );
    expect(getAuthErrorMessage(undefined, 'sign-out')).toBe('Unable to sign out. Please try again.');
  });
});
