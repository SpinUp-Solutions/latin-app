import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { updateTestVersionInputSchema } from '@/src/lib/tests/schemas';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type Context = { params: Promise<{ mockId: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const actor = await verifyAdminAccess(request);
    const mockId = firestoreDocumentIdSchema.parse((await params).mockId);
    const input = updateTestVersionInputSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ version: await mockTestService.updateActiveMockVersion(mockId, input, actor.uid) });
  } catch (error) {
    return testRouteErrorResponse(error, 'update mock version');
  }
}
