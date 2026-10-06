import { NextRequest, NextResponse } from 'next/server';
import { feedbackAdminStateRequestSchema, feedbackUuidSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { updateFeedbackState } from '@/src/lib/student-feedback/admin.server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    const actor = await verifyAdminAccess(request);
    const feedbackId = feedbackUuidSchema.parse((await params).feedbackId);
    const input = feedbackAdminStateRequestSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ feedback: await updateFeedbackState(feedbackId, actor, input) });
  } catch (error) {
    return routeErrorResponse(error, 'update feedback state');
  }
}
