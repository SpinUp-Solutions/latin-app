import { NextRequest, NextResponse } from 'next/server';
import { feedbackDocumentIdSchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { getAdminFeedback, getCurrentFeedbackLesson } from '@/src/lib/student-feedback/admin.server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  try {
    await verifyAdminAccess(request);
    const { feedbackId } = await params;
    feedbackDocumentIdSchema.parse(feedbackId);
    const feedback = await getAdminFeedback(feedbackId);
    return NextResponse.json({ feedback, currentLesson: await getCurrentFeedbackLesson(feedback.lesson?.id) });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'get feedback');
  }
}
