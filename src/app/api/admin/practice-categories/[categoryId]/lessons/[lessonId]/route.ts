import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string; lessonId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await verifyAdminAccess(request);
    const { categoryId, lessonId } = await params;
    const removed = await practiceCategoryService.removeLesson(categoryId, lessonId, actor.uid);
    return NextResponse.json({ success: true, removed });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'remove category lesson');
  }
}
