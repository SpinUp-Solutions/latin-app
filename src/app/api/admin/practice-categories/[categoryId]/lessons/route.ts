import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { addPracticeCategoryLessonsSchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const { categoryId } = await params;
    const detail = await practiceCategoryService.getCategoryLessons(categoryId);
    return NextResponse.json(detail);
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'fetch category lessons');
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId } = await params;
    const input = addPracticeCategoryLessonsSchema.parse(await request.json().catch(() => null));
    const memberships = await practiceCategoryService.addLessons(categoryId, input.lessonIds, actor.uid);
    return NextResponse.json({ success: true, memberships });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'add category lessons');
  }
}
