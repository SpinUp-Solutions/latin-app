import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { updateMockTestInputSchema } from '@/src/lib/tests/schemas';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
type Context = { params: Promise<{ mockId: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try {
    await verifyAdminAccess(request);
    return NextResponse.json({
      mock: await mockTestService.getMock(firestoreDocumentIdSchema.parse((await params).mockId)),
    });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch mock test');
  }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    const id = firestoreDocumentIdSchema.parse((await params).mockId);
    return NextResponse.json({
      mock: await mockTestService.updateMock(
        id,
        updateMockTestInputSchema.parse(await request.json().catch(() => null)),
        actor.uid
      ),
    });
  } catch (error) {
    return testRouteErrorResponse(error, 'update mock test');
  }
}
