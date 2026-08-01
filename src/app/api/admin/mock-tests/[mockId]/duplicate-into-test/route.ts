import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { duplicateStandaloneMockVersionIntoTestInputSchema } from '@/src/lib/tests/schemas';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
type Context = { params: Promise<{ mockId: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    const id = firestoreDocumentIdSchema.parse((await params).mockId);
    const input = duplicateStandaloneMockVersionIntoTestInputSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(await mockTestService.duplicateStandaloneMockVersionIntoTest(id, input, actor.uid));
  } catch (error) {
    return testRouteErrorResponse(error, 'duplicate mock version into test');
  }
}
