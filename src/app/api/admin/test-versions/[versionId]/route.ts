import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type RouteContext = { params: Promise<{ versionId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const versionId = firestoreDocumentIdSchema.parse((await params).versionId);
    return NextResponse.json({ version: await testAuthoringService.getTestVersion(versionId) });
  } catch (error) {
    return routeErrorResponse(error, 'fetch test version');
  }
}
