import { NextRequest, NextResponse } from 'next/server';
import { LEARNING_UNITS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import type { Lesson } from '@/src/types/lesson';
import { validateLessonProgression } from '@/src/utils/lessonProgress';
import { assertLegacyNormalPlacementAllowedInTransaction } from '@/src/lib/learning-units/learning-path-service';
import { RequestError } from '@/src/lib/domain-error';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { routeErrorResponse } from '@/src/lib/route-error-response';

interface UpdateRequest {
  lessonIds: string[];
  isLive: boolean;
  lessonType: 'normal' | 'vocab' | 'sentence-diagramming' | 'listening';
  expectedLiveLessonIds: string[];
  startOrder?: number;
}

const LESSON_TYPES = new Set<UpdateRequest['lessonType']>(['normal', 'vocab', 'sentence-diagramming', 'listening']);

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);

    const { lessonIds, isLive, lessonType, expectedLiveLessonIds, startOrder }: UpdateRequest = await request.json();

    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return NextResponse.json({ error: 'lessonIds array required' }, { status: 400 });
    }
    if (
      lessonIds.length > 500 ||
      lessonIds.some(id => typeof id !== 'string') ||
      new Set(lessonIds).size !== lessonIds.length
    ) {
      return NextResponse.json({ error: 'lessonIds must contain 1-500 unique string IDs' }, { status: 400 });
    }
    if (typeof isLive !== 'boolean' || !LESSON_TYPES.has(lessonType)) {
      return NextResponse.json({ error: 'Valid isLive and lessonType values are required' }, { status: 400 });
    }
    if (
      !Array.isArray(expectedLiveLessonIds) ||
      expectedLiveLessonIds.length > 500 ||
      expectedLiveLessonIds.some(id => typeof id !== 'string') ||
      new Set(expectedLiveLessonIds).size !== expectedLiveLessonIds.length
    ) {
      return NextResponse.json({ error: 'expectedLiveLessonIds must contain unique string IDs' }, { status: 400 });
    }
    if (startOrder !== undefined && (!Number.isSafeInteger(startOrder) || startOrder < 0)) {
      return NextResponse.json({ error: 'startOrder must be a nonnegative integer' }, { status: 400 });
    }

    const processedCount = await runVocabularyContentMutation(adminDb, async transaction => {
      if (lessonType === 'normal') {
        await assertLegacyNormalPlacementAllowedInTransaction(transaction, adminDb);
      }
      const lessonRefs = lessonIds.map(lessonId => adminDb.collection(LEARNING_UNITS_COLLECTION).doc(lessonId));
      const lessonDocs = await transaction.getAll(...lessonRefs);
      const lessons = lessonDocs.map((lessonDoc, index) => {
        if (!lessonDoc.exists) {
          throw new RequestError(404, 'LESSON_NOT_FOUND', `Lesson ${lessonIds[index]} not found`);
        }

        const data = lessonDoc.data();
        if (!isLessonDocumentData(data)) {
          throw new RequestError(400, 'LESSON_INVALID', `Document ${lessonIds[index]} is not a lesson`);
        }
        if ((data.type || 'normal') !== lessonType) {
          throw new RequestError(
            409,
            'LESSON_TYPE_MISMATCH',
            `Lesson ${lessonIds[index]} does not belong to the active lesson type`
          );
        }

        return { data: data as Partial<Lesson>, ref: lessonRefs[index] };
      });

      const liveSnapshot = await transaction.get(adminDb.collection(LEARNING_UNITS_COLLECTION).where('isLive', '==', true));
      const currentTypeLiveIds = liveSnapshot.docs
        .filter(doc => {
          const data = doc.data();
          return isLessonDocumentData(data) && (data.type || 'normal') === lessonType;
        })
        .map(doc => doc.id);
      const expectedLiveIds = new Set(expectedLiveLessonIds);

      if (
        currentTypeLiveIds.length !== expectedLiveIds.size ||
        currentTypeLiveIds.some(id => !expectedLiveIds.has(id))
      ) {
        throw new RequestError(
          409,
          'STALE_LIVE_LESSONS',
          'Live lessons changed since the page loaded. Refresh and try again.'
        );
      }

      let nextOrder = startOrder;
      if (isLive && nextOrder === undefined) {
        const maxOrderSnapshot = await transaction.get(
          adminDb.collection(LEARNING_UNITS_COLLECTION).where('isLive', '==', true).orderBy('liveOrder', 'desc')
        );
        const maxOrderDoc = maxOrderSnapshot.docs.find(doc => isLessonDocumentData(doc.data()));
        nextOrder = maxOrderDoc ? maxOrderDoc.data().liveOrder + 1 : 0;
      }

      if (!isLive) {
        const requestedIds = new Set(lessonIds);

        if (currentTypeLiveIds.length > 0 && currentTypeLiveIds.every(id => requestedIds.has(id))) {
          throw new RequestError(409, 'LAST_LIVE_LESSON', 'At least one lesson of this type must remain live');
        }
      }

      let count = 0;
      for (const { data: lessonData, ref: lessonRef } of lessons) {
        if (lessonData.isLive === isLive) continue;

        if (isLive) {
          const progressionErrors = validateLessonProgression({ pages: lessonData.pages || [] });
          if (progressionErrors.length > 0) {
            throw new RequestError(400, 'LESSON_PROGRESSION_INVALID', `Cannot publish lesson ${lessonRef.id}`, {
              progressionErrors,
            });
          }
        }

        const updateData: Record<string, string | number | boolean | null> = {
          isLive,
          publishedBy: user.uid,
          updatedAt: new Date().toISOString(),
        };

        if (isLive && nextOrder !== undefined) {
          updateData.liveOrder = nextOrder++;
          updateData.publishedAt = new Date().toISOString();
        } else {
          updateData.liveOrder = null;
          updateData.publishedAt = null;
        }

        transaction.update(lessonRef, updateData);
        count++;
      }

      return count;
    });

    return NextResponse.json({
      success: true,
      message: `${isLive ? 'Published' : 'Unpublished'} ${processedCount} lessons`,
      processedCount,
    });
  } catch (error) {
    return routeErrorResponse(error, 'update lesson publish status');
  }
}
