import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';
import { RequestError } from '@/src/lib/domain-error';
import { parseLessonSaveInput, saveLessonInTransaction } from '@/src/lib/learning-units/lesson-save.server';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

const recoveryNotFound = () => new RequestError(404, 'RECOVERY_NOT_FOUND', 'Recovery item not found');
const recoveryForbidden = () => new RequestError(403, 'RECOVERY_FORBIDDEN', 'Forbidden');

// POST - Retry save from recovery (creates or updates the lesson)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await verifyAdminAccess(request);

    const { id: recoveryId } = await params;
    const recoveryRef = adminDb.collection('lesson_recovery').doc(recoveryId);
    const result = await runVocabularyContentMutation(adminDb, async transaction => {
      const recoveryData = (await transaction.get(recoveryRef)).data();
      if (!recoveryData) throw recoveryNotFound();
      if (recoveryData.userId !== user.uid) throw recoveryForbidden();
      if (recoveryData.status !== 'pending') {
        throw new RequestError(409, 'RECOVERY_NOT_PENDING', 'Recovery item is no longer pending');
      }

      // A recovered payload may carry the joined categories instead of their IDs.
      const rawLesson = recoveryData.rawLessonData as Partial<Lesson> | undefined;
      const fallbackCategoryIds = rawLesson?.practiceCategories?.map(category => category.id);
      const saved = await saveLessonInTransaction(
        transaction,
        adminDb,
        parseLessonSaveInput(rawLesson, fallbackCategoryIds),
        user.uid,
        'create-or-update'
      );
      transaction.update(recoveryRef, { status: 'recovered', recoveredAt: saved.lesson.updatedAt });
      return saved;
    });

    const { lesson } = result;
    console.log(
      `[RECOVERY] ${result.created ? 'Created' : 'Updated'} lesson "${lesson.title}" (${lesson.id}) from recovery by user ${user.uid}`
    );

    return NextResponse.json({
      success: true,
      lesson,
      message: result.created
        ? 'Lesson created successfully from recovery'
        : 'Lesson updated successfully from recovery',
    });
  } catch (error) {
    return routeErrorResponse(error, 'retry lesson from recovery');
  }
}

// DELETE - Remove/discard recovery item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await verifyAdminAccess(request);

    const { id: recoveryId } = await params;

    const recoveryDoc = await adminDb.collection('lesson_recovery').doc(recoveryId).get();
    if (!recoveryDoc.exists) throw recoveryNotFound();
    if (recoveryDoc.data()?.userId !== user.uid) throw recoveryForbidden();

    // Discarded rather than deleted to keep an audit trail.
    await adminDb.collection('lesson_recovery').doc(recoveryId).update({
      status: 'discarded',
      discardedAt: new Date().toISOString(),
    });

    console.log(`[RECOVERY] Recovery item ${recoveryId} discarded by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Recovery item discarded',
    });
  } catch (error) {
    return routeErrorResponse(error, 'discard recovery item');
  }
}
