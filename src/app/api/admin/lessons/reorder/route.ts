import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { assertLegacyNormalPlacementAllowedInTransaction } from '@/src/lib/learning-units/learning-path-service';
import { LearningPathServiceError } from '@/src/lib/learning-units/learning-path-errors';
import type { LessonUnitType } from '@/src/types/learning-unit';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

interface ReorderUpdate {
  lessonId: string;
  liveOrder: number;
}

class ReorderError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = 'ReorderError';
  }
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
      const refs = updates.map(update => adminDb.collection('lessons').doc(update.lessonId));
      const snapshots = await transaction.getAll(...refs);
      const lessonTypes = new Set<LessonUnitType>();

      snapshots.forEach((snapshot, index) => {
        const data = snapshot.data();
        if (!snapshot.exists || !isLessonDocumentData(data)) {
          throw new ReorderError(404, `Lesson ${updates[index].lessonId} not found`);
        }
        lessonTypes.add((data.type ?? 'normal') as LessonUnitType);
      });
      if (lessonTypes.size !== 1) {
        throw new ReorderError(409, 'All reordered lessons must have the same lesson type');
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
    if (error instanceof ReorderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof LearningPathServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
      return NextResponse.json(
        {
          error: error.message,
          ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
        },
        { status: error.status }
      );
    }
    console.error('Error reordering lessons:', error);
    return NextResponse.json({ error: 'Failed to reorder lessons' }, { status: 500 });
  }
}
