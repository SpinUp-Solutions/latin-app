import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { updatePracticeTagSchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string; tagId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId, tagId } = await params;
    const input = updatePracticeTagSchema.parse(await request.json().catch(() => null));
    const tag = await practiceCategoryService.updateTag(categoryId, tagId, input, actor.uid);
    return NextResponse.json({ success: true, tag });
  } catch (error) {
    return routeErrorResponse(error, 'update practice tag');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId, tagId } = await params;
    await practiceCategoryService.deleteTag(categoryId, tagId, actor.uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error, 'delete practice tag');
  }
}
