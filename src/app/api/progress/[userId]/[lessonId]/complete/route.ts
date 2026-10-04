import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordLessonProgress } from '@/src/lib/learning-units/lesson-progress.server';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

const finishRequestSchema = z.object({ finalPageId: z.string().min(1) });

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

    const finish = finishRequestSchema.safeParse(await request.json().catch(() => null));
    if (!finish.success) {
      return NextResponse.json({ error: 'finalPageId is required' }, { status: 400 });
    }

    const result = await recordLessonProgress(userId, lessonId, { action: 'finish', ...finish.data });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return routeErrorResponse(error, 'complete lesson', { surface: 'finish_lesson' });
  }
}
