import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testVersionDraftInputSchema } from '@/src/lib/tests/schemas';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const id = firestoreDocumentIdSchema.parse((await params).id);
    const input = testVersionDraftInputSchema.parse(await request.json().catch(() => null));
    const result = await testAuthoringService.addTestVersion(id, input, actor.uid);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return testRouteErrorResponse(error, 'create test version');
  }
}
