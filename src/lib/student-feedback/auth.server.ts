import type { NextRequest } from 'next/server';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { FeedbackError } from './http.server';

/** Feedback requires a signed-in account; anonymous Firebase Auth is not an account. */
export async function verifyFeedbackActor(request: NextRequest) {
  const actor = await verifyRequestAuth(request);
  if (!actor || actor.firebase?.sign_in_provider === 'anonymous') {
    throw new FeedbackError('FEEDBACK_FORBIDDEN', 'Sign in to submit feedback', 401);
  }
  return actor;
}
