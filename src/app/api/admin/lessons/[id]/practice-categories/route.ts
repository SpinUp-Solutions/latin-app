import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { reconcilePracticeCategoriesSchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const { id } = await params;
    const assignments = await practiceCategoryService.getLessonCategories(id);
    return NextResponse.json(assignments);
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'fetch lesson practice categories');
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { id } = await params;
    const input = reconcilePracticeCategoriesSchema.parse(await request.json().catch(() => null));
    const assignments = await practiceCategoryService.reconcileLessonCategories(
      id,
      input.practiceCategoryIds,
      actor.uid
    );
    return NextResponse.json({ success: true, ...assignments });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'update lesson practice categories');
  }
}
