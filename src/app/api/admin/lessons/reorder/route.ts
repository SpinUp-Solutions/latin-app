import { NextRequest, NextResponse } from 'next/server';
import { LEARNING_UNITS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { assertLegacyNormalPlacementAllowedInTransaction } from '@/src/lib/learning-units/learning-path-service';
import { RequestError } from '@/src/lib/domain-error';
import type { LessonUnitType } from '@/src/types/learning-unit';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { routeErrorResponse } from '@/src/lib/route-error-response';

interface ReorderUpdate {
  lessonId: string;
  liveOrder: number;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    const { updates }: { updates: ReorderUpdate[] } = await request.json();

    if (
      !Array.isArray(updates) ||
      updates.length === 0 ||
      updates.length > 500 ||
      updates.some(
        update =>
          !update ||
          typeof update.lessonId !== 'string' ||
          !Number.isSafeInteger(update.liveOrder) ||
          update.liveOrder < 0
      ) ||
      new Set(updates.map(update => update.lessonId)).size !== updates.length ||
      new Set(updates.map(update => update.liveOrder)).size !== updates.length
    ) {
      return NextResponse.json(
        { error: 'Updates must contain 1-500 unique lesson IDs and unique nonnegative orders' },
        { status: 400 }
      );
    }

    await runVocabularyContentMutation(adminDb, async transaction => {
      const refs = updates.map(update => adminDb.collection(LEARNING_UNITS_COLLECTION).doc(update.lessonId));
      const snapshots = await transaction.getAll(...refs);
      const lessonTypes = new Set<LessonUnitType>();

      snapshots.forEach((snapshot, index) => {
        const data = snapshot.data();
        if (!snapshot.exists || !isLessonDocumentData(data)) {
          throw new RequestError(404, 'LESSON_NOT_FOUND', `Lesson ${updates[index].lessonId} not found`);
        }
        lessonTypes.add((data.type ?? 'normal') as LessonUnitType);
      });
      if (lessonTypes.size !== 1) {
        throw new RequestError(409, 'LESSON_TYPE_MISMATCH', 'All reordered lessons must have the same lesson type');
      }
      if (lessonTypes.has('normal')) {
        await assertLegacyNormalPlacementAllowedInTransaction(transaction, adminDb);
      }

      const updatedAt = new Date().toISOString();
      updates.forEach((update, index) => {
        transaction.update(refs[index], {
          liveOrder: update.liveOrder,
          updatedAt,
          updatedBy: user.uid,
        });
      });
    });

    return NextResponse.json({
      success: true,
      message: `Updated order for ${updates.length} lessons`,
      updatedCount: updates.length,
    });
  } catch (error) {
    return routeErrorResponse(error, 'reorder lessons');
  }
}
