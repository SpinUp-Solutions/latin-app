import { NextRequest, NextResponse } from 'next/server';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { assignVersionToMockInputSchema } from '@/src/lib/tests/schemas';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    return NextResponse.json({
      mock: await mockTestService.assignVersionToMock(
        assignVersionToMockInputSchema.parse(await request.json().catch(() => null)),
        actor.uid
      ),
    });
  } catch (error) {
    return routeErrorResponse(error, 'assign mock test');
  }
}
