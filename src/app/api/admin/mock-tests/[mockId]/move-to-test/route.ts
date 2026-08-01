import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { moveStandaloneMockToTestInputSchema } from '@/src/lib/tests/schemas';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
type Context = { params: Promise<{ mockId: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    return NextResponse.json(
      await mockTestService.moveStandaloneMockToTest(
        firestoreDocumentIdSchema.parse((await params).mockId),
        moveStandaloneMockToTestInputSchema.parse(await request.json().catch(() => null)),
        actor.uid
      )
    );
  } catch (error) {
    return testRouteErrorResponse(error, 'move mock test');
  }
}
