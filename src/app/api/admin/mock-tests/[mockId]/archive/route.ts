import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
type Context = { params: Promise<{ mockId: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    return NextResponse.json({
      mock: await mockTestService.archiveMock(firestoreDocumentIdSchema.parse((await params).mockId), actor.uid),
    });
  } catch (error) {
    return routeErrorResponse(error, 'archive mock test');
  }
}
