import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { reorderPracticeTagsSchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId } = await params;
    const input = reorderPracticeTagsSchema.parse(await request.json().catch(() => null));
    const tags = await practiceCategoryService.reorderTags(categoryId, input.orderedTagIds, actor.uid);
    return NextResponse.json({ success: true, tags });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'reorder practice tags');
  }
}
