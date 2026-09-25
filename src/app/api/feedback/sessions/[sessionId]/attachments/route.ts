import { NextRequest, NextResponse } from 'next/server';
import { feedbackUuidSchema, reserveFeedbackAttachmentRequestSchema } from '@/shared/student-feedback';
import { verifyFeedbackActor } from '@/src/lib/student-feedback/auth.server';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { reserveFeedbackAttachment } from '@/src/lib/student-feedback/attachments.server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const actor = await verifyFeedbackActor(request);
    const { sessionId } = await params;
    feedbackUuidSchema.parse(sessionId);
    const input = reserveFeedbackAttachmentRequestSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(await reserveFeedbackAttachment(actor.uid, sessionId, input), { status: 201 });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'reserve feedback attachment');
  }
}
