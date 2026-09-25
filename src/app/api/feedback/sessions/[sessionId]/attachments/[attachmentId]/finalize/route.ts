import { NextRequest, NextResponse } from 'next/server';
import { feedbackUuidSchema } from '@/shared/student-feedback';
import { verifyFeedbackActor } from '@/src/lib/student-feedback/auth.server';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { finalizeFeedbackAttachment } from '@/src/lib/student-feedback/attachments.server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; attachmentId: string }> }
) {
  try {
    const actor = await verifyFeedbackActor(request);
    const { sessionId, attachmentId } = await params;
    feedbackUuidSchema.parse(sessionId);
    feedbackUuidSchema.parse(attachmentId);
    return NextResponse.json({ attachment: await finalizeFeedbackAttachment(actor.uid, sessionId, attachmentId) });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'finalize feedback attachment');
  }
}
