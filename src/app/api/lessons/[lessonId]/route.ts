import { NextRequest, NextResponse } from 'next/server';
import {
  StudentDashboardServiceError,
  studentDashboardService,
} from '@/src/lib/learning-units/student-dashboard-service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { reportServerUnexpectedError } from '@/src/lib/report-unexpected-error';

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
    if (error instanceof StudentDashboardServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Unable to load student lesson:', error);
    reportServerUnexpectedError(error, {
      tags: { surface: 'student_lesson', lessonId, userId: student.uid },
    });
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 });
  }
}
