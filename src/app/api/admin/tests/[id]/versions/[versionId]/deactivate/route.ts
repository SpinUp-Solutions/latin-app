import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type Context = { params: Promise<{ id: string; versionId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    const values = await params;
    const testId = firestoreDocumentIdSchema.parse(values.id);
    const versionId = firestoreDocumentIdSchema.parse(values.versionId);
    const result = await testAuthoringService.deactivateTestVersion(testId, versionId, actor.uid);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return testRouteErrorResponse(error, 'deactivate test version');
  }
}
