import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { reorderPracticeCategoryLessonsSchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId } = await params;
    const input = reorderPracticeCategoryLessonsSchema.parse(await request.json().catch(() => null));
    const memberships = await practiceCategoryService.reorderLessons(categoryId, input.orderedLessonIds, actor.uid);
    return NextResponse.json({ success: true, memberships });
  } catch (error) {
    return routeErrorResponse(error, 'reorder category lessons');
  }
}
