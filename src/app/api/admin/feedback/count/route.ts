import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { feedbackRouteErrorResponse } from '@/src/lib/student-feedback/http.server';
import { countOpenFeedback } from '@/src/lib/student-feedback/admin.server';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    return NextResponse.json({ count: await countOpenFeedback() });
  } catch (error) {
    return feedbackRouteErrorResponse(error, 'count feedback');
  }
}
