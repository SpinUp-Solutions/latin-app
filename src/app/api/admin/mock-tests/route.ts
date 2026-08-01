import { NextRequest, NextResponse } from 'next/server';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { createStandaloneMockInputSchema, reorderMockTestsInputSchema } from '@/src/lib/tests/schemas';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    return NextResponse.json({ mocks: await mockTestService.listMocks() });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch mock tests');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    const input = createStandaloneMockInputSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(await mockTestService.createStandaloneMock(input, actor.uid), { status: 201 });
  } catch (error) {
    return testRouteErrorResponse(error, 'create mock test');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    const input = reorderMockTestsInputSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ mocks: await mockTestService.reorderMocks(input, actor.uid) });
  } catch (error) {
    return testRouteErrorResponse(error, 'reorder mock tests');
  }
}
