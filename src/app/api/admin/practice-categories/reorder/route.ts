import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { reorderPracticeCategoriesSchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    const input = reorderPracticeCategoriesSchema.parse(await request.json().catch(() => null));
    const categories = await practiceCategoryService.reorderCategories(
      input.lessonType,
      input.orderedCategoryIds,
      actor.uid
    );
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'reorder practice categories');
  }
}
