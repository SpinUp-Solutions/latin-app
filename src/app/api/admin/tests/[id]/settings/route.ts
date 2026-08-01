import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { updateTestUnitInputSchema } from '@/src/lib/tests/schemas';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    const testId = firestoreDocumentIdSchema.parse((await params).id);
    const input = updateTestUnitInputSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ test: await testAuthoringService.updateTest(testId, input, actor.uid) });
  } catch (error) {
    return testRouteErrorResponse(error, 'update test settings');
  }
}
