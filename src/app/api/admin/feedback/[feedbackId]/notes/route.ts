import { NextRequest, NextResponse } from 'next/server';
import { feedbackAdminNoteRequestSchema, feedbackDocumentIdSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { addPrivateFeedbackNote } from '@/src/lib/student-feedback/admin.server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    const actor = await verifyAdminAccess(request);
    const { feedbackId } = await params;
    feedbackDocumentIdSchema.parse(feedbackId);
    const input = feedbackAdminNoteRequestSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ activity: await addPrivateFeedbackNote(feedbackId, actor, input) }, { status: 201 });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'add private feedback note');
  }
}
