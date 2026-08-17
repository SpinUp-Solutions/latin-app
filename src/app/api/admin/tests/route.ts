import { NextRequest, NextResponse } from 'next/server';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { createTestWithVersionSchema } from '@/src/lib/tests/schemas';
import { testAuthoringService } from '@/src/lib/tests/authoring-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    return NextResponse.json({ tests: await testAuthoringService.listTests() });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch tests');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    const input = createTestWithVersionSchema.parse(await request.json().catch(() => null));
    const result = await testAuthoringService.createTestWithVersion(input, actor.uid);
    return NextResponse.json({ success: true, ...result }, { status: result.recovered ? 200 : 201 });
  } catch (error) {
    return testRouteErrorResponse(error, 'create test');
  }
}
