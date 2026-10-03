import { NextRequest, NextResponse } from 'next/server';
import { studentDashboardService } from '@/src/lib/learning-units/student-dashboard-service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { routeErrorResponse } from '@/src/lib/route-error-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const student = await verifyRequestAuth(request);
  if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json({ dashboard: await studentDashboardService.getDashboard(student.uid) });
  } catch (error) {
    return routeErrorResponse(error, 'fetch student dashboard', { surface: 'student_dashboard', userId: student.uid });
  }
}
