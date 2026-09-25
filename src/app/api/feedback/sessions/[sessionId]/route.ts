import { NextRequest, NextResponse } from 'next/server';
import { createFeedbackSessionRequestSchema } from '@/shared/student-feedback';
import { verifyFeedbackActor } from '@/src/lib/student-feedback/auth.server';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { getPublicFeedbackSession } from '@/src/lib/student-feedback/service.server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = await verifyFeedbackActor(request);
    const { sessionId } = await params;
    createFeedbackSessionRequestSchema.parse({ sessionId });
    return NextResponse.json({ session: await getPublicFeedbackSession(actor.uid, sessionId) });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'get feedback session');
  }
}
