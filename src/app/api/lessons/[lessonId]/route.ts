import { NextRequest, NextResponse } from 'next/server';
import { studentDashboardService } from '@/src/lib/learning-units/student-dashboard-service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { routeErrorResponse } from '@/src/lib/route-error-response';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const student = await verifyRequestAuth(request);
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lessonId } = await params;

  try {
    return NextResponse.json({ lesson: await studentDashboardService.getLesson(student.uid, lessonId) });
  } catch (error) {
    return routeErrorResponse(error, 'fetch lesson', { surface: 'student_lesson', lessonId, userId: student.uid });
  }
}
