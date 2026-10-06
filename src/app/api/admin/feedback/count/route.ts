import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { countOpenFeedback } from '@/src/lib/student-feedback/admin.server';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    return NextResponse.json({ count: await countOpenFeedback() });
  } catch (error) {
    return routeErrorResponse(error, 'count feedback');
  }
}
