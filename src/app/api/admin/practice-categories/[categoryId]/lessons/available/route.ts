import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

type RouteContext = { params: Promise<{ categoryId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await verifyAdminAccess(request);
    const { categoryId } = await params;
    const availableLessons = await practiceCategoryService.getAvailableCategoryLessons(categoryId);
    return NextResponse.json({ availableLessons });
  } catch (error) {
    return routeErrorResponse(error, 'fetch available category lessons');
  }
}
