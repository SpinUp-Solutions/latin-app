import { NextRequest, NextResponse } from 'next/server';
import { feedbackUuidSchema } from '@/shared/student-feedback';
import { verifyFeedbackActor } from '@/src/lib/student-feedback/auth.server';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { removeFeedbackAttachment } from '@/src/lib/student-feedback/attachments.server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; attachmentId: string }> }
) {
  try {
    const actor = await verifyFeedbackActor(request);
    const { sessionId, attachmentId } = await params;
    feedbackUuidSchema.parse(sessionId);
    feedbackUuidSchema.parse(attachmentId);
    return NextResponse.json({ attachment: await removeFeedbackAttachment(actor.uid, sessionId, attachmentId) });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'remove feedback attachment');
  }
}
