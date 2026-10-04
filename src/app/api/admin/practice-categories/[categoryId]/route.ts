import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { updatePracticeCategorySchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId } = await params;
    const input = updatePracticeCategorySchema.parse(await request.json().catch(() => null));
    const category = await practiceCategoryService.updateCategory(categoryId, input, actor.uid);
    return NextResponse.json({ success: true, category });
  } catch (error) {
    return routeErrorResponse(error, 'update practice category');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const { categoryId } = await params;
    await practiceCategoryService.deleteCategory(categoryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error, 'delete practice category');
  }
}
