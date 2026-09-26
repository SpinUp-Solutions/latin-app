import { NextRequest, NextResponse } from 'next/server';
import { feedbackAdminNoteRequestSchema, feedbackUuidSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { addFeedbackNote } from '@/src/lib/student-feedback/admin.server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    const actor = await verifyAdminAccess(request);
    const feedbackId = feedbackUuidSchema.parse((await params).feedbackId);
    const { note } = feedbackAdminNoteRequestSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ activity: await addFeedbackNote(feedbackId, actor, note) }, { status: 201 });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'add feedback note');
  }
}
