import { NextRequest, NextResponse } from 'next/server';
import { feedbackActivityListQuerySchema, feedbackDocumentIdSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { listFeedbackActivity } from '@/src/lib/student-feedback/admin.server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    await verifyAdminAccess(request);
    const { feedbackId } = await params;
    feedbackDocumentIdSchema.parse(feedbackId);
    const { cursor } = feedbackActivityListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await listFeedbackActivity(feedbackId, cursor));
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'list feedback activity');
  }
}
