import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { createPracticeCategorySchema, listPracticeCategoriesQuerySchema } from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    const query = listPracticeCategoriesQuerySchema.parse({
      lessonType: request.nextUrl.searchParams.get('lessonType') ?? undefined,
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    });
    const categories = await practiceCategoryService.listCategories({
      ...query,
      includeCounts: request.nextUrl.searchParams.get('includeCounts') === 'true',
    });
    return NextResponse.json({ categories });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'fetch practice categories');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    const input = createPracticeCategorySchema.parse(await request.json().catch(() => null));
    const category = await practiceCategoryService.createCategory(input, actor.uid);
    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'create practice category');
  }
}
