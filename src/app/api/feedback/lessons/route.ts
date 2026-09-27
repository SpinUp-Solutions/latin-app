import { NextRequest, NextResponse } from 'next/server';
import { verifyFeedbackActor } from '@/src/lib/student-feedback/auth.server';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { listAccessibleFeedbackLessons } from '@/src/lib/student-feedback/lessons.server';

export async function GET(request: NextRequest) {
  try {
    const actor = await verifyFeedbackActor(request);
    return NextResponse.json({ lessons: await listAccessibleFeedbackLessons(actor.uid) });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'list feedback lessons');
  }
}
