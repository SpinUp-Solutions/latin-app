import { NextRequest, NextResponse } from 'next/server';
import { submitFeedbackRequestSchema } from '@/shared/student-feedback';
import { verifyFeedbackActor } from '@/src/lib/student-feedback/auth.server';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { submitFeedback } from '@/src/lib/student-feedback/service.server';

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyFeedbackActor(request);
    const input = submitFeedbackRequestSchema.parse(await request.json().catch(() => null));
    const receipt = await submitFeedback(actor, input);
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'submit feedback');
  }
}
