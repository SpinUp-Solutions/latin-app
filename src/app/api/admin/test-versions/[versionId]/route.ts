import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { updateTestVersionInputSchema } from '@/src/lib/tests/schemas';
import { testService } from '@/src/lib/tests/service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type RouteContext = { params: Promise<{ versionId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const versionId = firestoreDocumentIdSchema.parse((await params).versionId);
    return NextResponse.json({ version: await testService.getTestVersion(versionId) });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch test version');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const versionId = firestoreDocumentIdSchema.parse((await params).versionId);
    const input = updateTestVersionInputSchema.parse(await request.json().catch(() => null));
    const version = await testService.updateTestVersion(versionId, input, actor.uid);
    return NextResponse.json({ success: true, version });
  } catch (error) {
    return testRouteErrorResponse(error, 'update test version');
  }
}
