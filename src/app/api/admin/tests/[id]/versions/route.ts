import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testVersionInputSchema } from '@/src/lib/tests/schemas';
import { testService } from '@/src/lib/tests/service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const id = firestoreDocumentIdSchema.parse((await params).id);
    return NextResponse.json({ versions: await testService.listTestVersions(id) });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch test versions');
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const id = firestoreDocumentIdSchema.parse((await params).id);
    const input = testVersionInputSchema.parse(await request.json().catch(() => null));
    const result = await testService.addTestVersion(id, input, actor.uid);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return testRouteErrorResponse(error, 'create test version');
  }
}
