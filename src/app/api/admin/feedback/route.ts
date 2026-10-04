import { NextRequest, NextResponse } from 'next/server';
import { feedbackAdminListQuerySchema } from '@/shared/student-feedback';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { listFeedback } from '@/src/lib/student-feedback/admin.server';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    const filters = feedbackAdminListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await listFeedback(filters));
  } catch (error) {
    return routeErrorResponse(error, 'list feedback');
  }
}
