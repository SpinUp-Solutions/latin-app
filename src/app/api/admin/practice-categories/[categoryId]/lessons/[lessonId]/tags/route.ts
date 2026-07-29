import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { replacePracticeMembershipTagsSchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string; lessonId: string }> };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId, lessonId } = await params;
    const input = replacePracticeMembershipTagsSchema.parse(await request.json().catch(() => null));
    const membership = await practiceCategoryService.replaceMembershipTags(
      categoryId,
      lessonId,
      input.tagIds,
      actor.uid
    );
    return NextResponse.json({ success: true, membership });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'update lesson practice tags');
  }
}
