import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { createPracticeTagSchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId } = await params;
    const input = createPracticeTagSchema.parse(await request.json().catch(() => null));
    const tag = await practiceCategoryService.createTag(categoryId, input, actor.uid);
    return NextResponse.json({ success: true, tag }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, 'create practice tag');
  }
}
