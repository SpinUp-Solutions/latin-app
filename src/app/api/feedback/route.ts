import { NextRequest, NextResponse } from 'next/server';
import { submitFeedbackRequestSchema } from '@/shared/student-feedback';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { FeedbackError } from '@/src/lib/student-feedback/http.server';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { submitFeedback } from '@/src/lib/student-feedback/service.server';

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyRequestAuth(request);
    // Feedback requires a signed-in account; anonymous Firebase Auth is not an account.
    if (!actor || actor.firebase?.sign_in_provider === 'anonymous') {
      throw new FeedbackError('FEEDBACK_FORBIDDEN', 'Sign in to submit feedback', 401);
    }
    const input = submitFeedbackRequestSchema.parse(await request.json().catch(() => null));
    const receipt = await submitFeedback(actor, input);
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, 'submit feedback');
  }
}
