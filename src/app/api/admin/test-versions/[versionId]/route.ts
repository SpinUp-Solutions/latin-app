import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type RouteContext = { params: Promise<{ versionId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const versionId = firestoreDocumentIdSchema.parse((await params).versionId);
    return NextResponse.json({ version: await testAuthoringService.getTestVersion(versionId) });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch test version');
  }
}
