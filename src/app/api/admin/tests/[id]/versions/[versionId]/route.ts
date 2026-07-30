import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { updateTestVersionDraftInputSchema } from '@/src/lib/tests/schemas';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type Context = { params: Promise<{ id: string; versionId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    const values = await params;
    const testId = firestoreDocumentIdSchema.parse(values.id);
    const versionId = firestoreDocumentIdSchema.parse(values.versionId);
    const input = updateTestVersionDraftInputSchema.parse(await request.json().catch(() => null));
    const result = await testAuthoringService.updateTestVersionDraft(testId, versionId, input, actor.uid);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return testRouteErrorResponse(error, 'save inactive test version');
  }
}
