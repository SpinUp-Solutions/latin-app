import { NextRequest, NextResponse } from 'next/server';
import { learningPathRouteErrorResponse } from '@/src/lib/learning-units/learning-path-api';
import { learningPathService } from '@/src/lib/learning-units/learning-path-service';
import { saveLearningPathInputSchema } from '@/src/lib/learning-units/schemas';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    return NextResponse.json(await learningPathService.getAdminView());
  } catch (error) {
    return learningPathRouteErrorResponse(error, 'fetch Learning Path');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    const input = saveLearningPathInputSchema.parse(await request.json().catch(() => null));
    const path = await learningPathService.save(input, actor.uid);
    return NextResponse.json({ path });
  } catch (error) {
    return learningPathRouteErrorResponse(error, 'save Learning Path');
  }
}
