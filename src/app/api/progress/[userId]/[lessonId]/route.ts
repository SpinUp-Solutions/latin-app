import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordLessonProgress } from '@/src/lib/learning-units/lesson-progress.server';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

const progressRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('complete-exercise'),
    exerciseId: z.string().min(1),
    score: z.number().finite().min(0).max(100),
  }),
  z
    .object({
      action: z.literal('visit-page'),
      pageId: z.string().min(1).optional(),
      currentPageIndex: z.number().int().optional(),
    })
    .refine(data => data.pageId !== undefined || data.currentPageIndex !== undefined),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string; lessonId: string }> }
) {
  try {
    const { userId, lessonId } = await params;
    const currentUser = await verifyRequestAuth(request);

    if (!currentUser || currentUser.uid !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const step = progressRequestSchema.safeParse(await request.json().catch(() => null));
    if (!step.success) {
      return NextResponse.json({ error: 'Invalid progress request' }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(await recordLessonProgress(userId, lessonId, step.data)) });
  } catch (error) {
    return routeErrorResponse(error, 'update progress', { surface: 'progress_post' });
  }
}
