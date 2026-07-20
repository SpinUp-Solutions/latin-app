import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { updatePracticeCategorySchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const { categoryId } = await params;
    const category = await practiceCategoryService.getCategory(categoryId);
    return NextResponse.json({ category });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'fetch practice category');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId } = await params;
    const input = updatePracticeCategorySchema.parse(await request.json().catch(() => null));
    const category = await practiceCategoryService.updateCategory(categoryId, input, actor.uid);
    return NextResponse.json({ success: true, category });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'update practice category');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const { categoryId } = await params;
    await practiceCategoryService.deleteCategory(categoryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'delete practice category');
  }
}
