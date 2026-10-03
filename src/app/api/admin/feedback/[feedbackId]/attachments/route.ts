import { NextRequest, NextResponse } from 'next/server';
import { feedbackUuidSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { getFeedbackReport } from '@/src/lib/student-feedback/admin.server';
import { getFeedbackAttachmentLinks } from '@/src/lib/student-feedback/attachments.server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    await verifyAdminAccess(request);
    const feedbackId = feedbackUuidSchema.parse((await params).feedbackId);
    const links = await getFeedbackAttachmentLinks(await getFeedbackReport(feedbackId));
    return NextResponse.json(links, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return routeErrorResponse(error, 'sign feedback attachments');
  }
}
