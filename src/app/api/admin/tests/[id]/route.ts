import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { updateTestWithVersionInputSchema } from '@/src/lib/tests/schemas';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const id = firestoreDocumentIdSchema.parse((await params).id);
    return NextResponse.json(await testAuthoringService.getTest(id));
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch test');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const id = firestoreDocumentIdSchema.parse((await params).id);
    const input = updateTestWithVersionInputSchema.parse(await request.json().catch(() => null));
    const result = await testAuthoringService.updateTestWithVersion(id, input, actor.uid);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return testRouteErrorResponse(error, 'update test');
  }
}
