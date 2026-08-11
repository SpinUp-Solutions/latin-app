import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import type { Lesson } from '@/src/types/lesson';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { getLessonContentCounts } from '@/src/utils/lessonSummary';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

const BATCH_SIZE = 400;

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    const snapshot = await adminDb.collection('lessons').get();

    const lessonDocs = snapshot.docs.filter(doc => isLessonDocumentData(doc.data()));
    const updates = lessonDocs
      .map(doc => {
        const data = doc.data() as Lesson;
        const counts = getLessonContentCounts(data);
        const needsUpdate =
          data.totalPages !== counts.totalPages ||
          data.totalItems !== counts.totalItems ||
          data.totalExercises !== counts.totalExercises;

        return {
          id: doc.id,
          ref: doc.ref,
          counts,
          needsUpdate,
        };
      })
      .filter(item => item.needsUpdate);

    if (!dryRun) {
      for (let index = 0; index < updates.length; index += BATCH_SIZE) {
        await runVocabularyContentMutation(adminDb, async transaction => {
          for (const update of updates.slice(index, index + BATCH_SIZE)) {
            transaction.update(update.ref, update.counts);
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        dryRun,
        scannedLessons: lessonDocs.length,
        lessonsToUpdate: updates.length,
        updatedLessons: dryRun ? 0 : updates.length,
        sample: updates.slice(0, 10).map(({ id, counts }) => ({ id, ...counts })),
        requestedBy: user.uid,
      },
    });
  } catch (error) {
    console.error('Error backfilling lesson summaries:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
