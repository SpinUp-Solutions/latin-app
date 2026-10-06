import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { reactivateStandaloneMockInputSchema } from '@/src/lib/tests/schemas';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type Context = { params: Promise<{ mockId: string }> };

/** Restores an archived standalone mock when its version has no other active owner. */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    const mockId = firestoreDocumentIdSchema.parse((await params).mockId);
    const input = reactivateStandaloneMockInputSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ mock: await mockTestService.reactivateStandaloneMock(mockId, input, actor.uid) });
  } catch (error) {
    return routeErrorResponse(error, 'reactivate standalone mock test');
  }
}
