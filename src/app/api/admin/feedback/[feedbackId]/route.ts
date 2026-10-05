import { NextRequest, NextResponse } from 'next/server';
import { feedbackUuidSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { getFeedbackDetail } from '@/src/lib/student-feedback/admin.server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    await verifyAdminAccess(request);
    const feedbackId = feedbackUuidSchema.parse((await params).feedbackId);
    return NextResponse.json(await getFeedbackDetail(feedbackId));
  } catch (error) {
    return routeErrorResponse(error, 'get feedback');
  }
}
