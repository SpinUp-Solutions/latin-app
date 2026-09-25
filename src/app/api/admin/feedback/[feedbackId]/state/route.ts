import { NextRequest, NextResponse } from 'next/server';
import { feedbackAdminStateRequestSchema, feedbackDocumentIdSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { updateFeedbackState } from '@/src/lib/student-feedback/admin.server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    const actor = await verifyAdminAccess(request);
    const { feedbackId } = await params;
    feedbackDocumentIdSchema.parse(feedbackId);
    const input = feedbackAdminStateRequestSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ feedback: await updateFeedbackState(feedbackId, actor, input) });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'update feedback state');
  }
}
