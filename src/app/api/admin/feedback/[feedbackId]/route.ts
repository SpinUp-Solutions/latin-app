import { NextRequest, NextResponse } from 'next/server';
import { feedbackUuidSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { getFeedbackDetail } from '@/src/lib/student-feedback/admin.server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    await verifyAdminAccess(request);
    const feedbackId = feedbackUuidSchema.parse((await params).feedbackId);
    return NextResponse.json(await getFeedbackDetail(feedbackId));
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'get feedback');
  }
}
