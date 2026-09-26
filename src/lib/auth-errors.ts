type AuthErrorContext = 'sign-in' | 'registration' | 'password-reset' | 'password-change' | 'sign-out';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password. Please try again.',
  'auth/invalid-login-credentials': 'Incorrect email or password. Please try again.',
  'auth/wrong-password': 'Incorrect email or password. Please try again.',
  'auth/user-not-found': 'Incorrect email or password. Please try again.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Unable to connect. Check your internet connection and try again.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Password is too weak. Please choose a stronger password with at least 8 characters.',
  'auth/operation-not-allowed': 'This sign-in method is not available. Please contact support.',
  'auth/requires-recent-login': 'For security, please sign in again before making this change.',
  'auth/missing-email': 'Please enter your email address.',
};

const CONTEXT_FALLBACKS: Record<AuthErrorContext, string> = {
  'sign-in': 'Unable to sign in. Please check your credentials and try again.',
  registration: 'Unable to create your account. Please try again.',
  'password-reset': 'Unable to send a reset email. Please check your email address and try again.',
  'password-change': 'Unable to change your password. Please try again.',
  'sign-out': 'Unable to sign out. Please try again.',
};

function getFirebaseErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function getPasswordChangeMessage(code: string): string | undefined {
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Current password is incorrect.';
  }
  if (code === 'auth/weak-password') {
    return 'New password is too weak. Please choose a stronger one.';
  }
  return AUTH_ERROR_MESSAGES[code];
}

export function getAuthErrorMessage(error: unknown, context: AuthErrorContext): string {
  const code = getFirebaseErrorCode(error);
  if (!code) return CONTEXT_FALLBACKS[context];

  if (context === 'password-change') {
    return getPasswordChangeMessage(code) ?? CONTEXT_FALLBACKS[context];
  }

  return AUTH_ERROR_MESSAGES[code] ?? CONTEXT_FALLBACKS[context];
}
