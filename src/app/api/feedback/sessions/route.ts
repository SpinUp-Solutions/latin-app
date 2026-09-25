import { NextRequest, NextResponse } from 'next/server';
import { createFeedbackSessionRequestSchema } from '@/shared/student-feedback';
import { verifyFeedbackActor } from '@/src/lib/student-feedback/auth.server';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { createFeedbackSession, getPublicFeedbackSession } from '@/src/lib/student-feedback/service.server';

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyFeedbackActor(request);
    const input = createFeedbackSessionRequestSchema.parse(await request.json().catch(() => null));
    await createFeedbackSession(actor.uid, input.sessionId);
    return NextResponse.json({ session: await getPublicFeedbackSession(actor.uid, input.sessionId) }, { status: 201 });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'create feedback session');
  }
}
