import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { duplicateTestVersionInputSchema } from '@/src/lib/tests/schemas';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type Context = { params: Promise<{ id: string; versionId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    const paramsValue = await params;
    const testId = firestoreDocumentIdSchema.parse(paramsValue.id);
    const versionId = firestoreDocumentIdSchema.parse(paramsValue.versionId);
    const input = duplicateTestVersionInputSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(await testAuthoringService.duplicateTestVersion(testId, versionId, input, actor.uid), {
      status: 201,
    });
  } catch (error) {
    return testRouteErrorResponse(error, 'duplicate test version');
  }
}
