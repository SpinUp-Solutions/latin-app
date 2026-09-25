import { NextRequest, NextResponse } from 'next/server';
import { feedbackUuidSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { getAdminFeedbackAttachmentUrl } from '@/src/lib/student-feedback/attachments.server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ feedbackId: string; attachmentId: string }> }
) {
  try {
    await verifyAdminAccess(request);
    const { feedbackId, attachmentId } = await params;
    feedbackUuidSchema.parse(feedbackId);
    feedbackUuidSchema.parse(attachmentId);
    const disposition = request.nextUrl.searchParams.get('disposition');
    if (disposition !== null && disposition !== 'inline' && disposition !== 'attachment') {
      return NextResponse.json({ error: 'Invalid disposition', code: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const result = await getAdminFeedbackAttachmentUrl(feedbackId, attachmentId, disposition ?? 'attachment');
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'access feedback attachment');
  }
}
