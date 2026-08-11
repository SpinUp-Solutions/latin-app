import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { verifyAdminAccess } from '../../../../../../lib/verifyAdminAccess';
import { getLessonContentCounts } from '@/src/utils/lessonSummary';
import {
  optionalPracticeCategoryIdsSchema,
  optionalPracticeCategorySelectionsSchema,
} from '@/src/lib/practice-categories/schemas';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import {
  assertLegacyNormalPlacementChangeAllowedInTransaction,
  assertPlacedLessonReplacementAllowedInTransaction,
} from '@/src/lib/learning-units/learning-path-service';
import { lessonAuthoringInputSchema, lessonUnitDocumentSchema } from '@/src/lib/learning-units/schemas';
import { assertVocabularyPoolAssignmentsAllowedInTransaction } from '@/src/lib/vocabulary-pools/assignment.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

class RecoveryRouteError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RecoveryRouteError';
  }
}

// POST - Retry save from recovery (creates or updates the lesson)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const recoveryId = id;
    const recoveryRef = adminDb.collection('lesson_recovery').doc(recoveryId);
    const result = await runVocabularyContentMutation(adminDb, async transaction => {
      const recoveryDoc = await transaction.get(recoveryRef);
      if (!recoveryDoc.exists) {
        throw new RecoveryRouteError('Recovery item not found', 404);
      }
      const recoveryData = recoveryDoc.data();
      if (!recoveryData) {
        throw new RecoveryRouteError('Recovery data is empty', 404);
      }
      if (recoveryData.userId !== user.uid) {
        throw new RecoveryRouteError('Forbidden', 403);
      }
      if (recoveryData.status !== 'pending') {
        throw new RecoveryRouteError('Recovery item is no longer pending', 409);
      }

      const rawLesson = recoveryData.rawLessonData as Lesson;
      if (!isLessonDocumentData(rawLesson)) {
        throw new RecoveryRouteError('Recovery item does not contain a lesson', 400);
      }
      if (rawLesson.showWordSearch !== undefined && typeof rawLesson.showWordSearch !== 'boolean') {
        throw new RecoveryRouteError('showWordSearch must be a boolean', 400);
      }
      const fallbackCategoryIds = rawLesson.practiceCategories?.map(category => category.id);
      const practiceCategorySelections = optionalPracticeCategorySelectionsSchema.parse(
        rawLesson.practiceCategorySelections
      );
      const practiceCategoryIds = optionalPracticeCategoryIdsSchema.parse(
        rawLesson.practiceCategoryIds ?? fallbackCategoryIds
      );
      const lesson = lessonAuthoringInputSchema.parse(rawLesson);
      const lessonRef = adminDb.collection('lessons').doc(lesson.id);
      const existingLessonDoc = await transaction.get(lessonRef);
      const lessonExists = existingLessonDoc.exists;
      const existingLesson = existingLessonDoc.data();
      if (lessonExists && !isLessonDocumentData(existingLesson)) {
        throw new RecoveryRouteError('A test cannot be recovered through the lesson endpoint', 404);
      }
      const { totalPages, totalItems, totalExercises } = getLessonContentCounts(lesson);
      const now = new Date().toISOString();
      const lessonData = lessonUnitDocumentSchema.parse(
        lessonExists
          ? {
              ...lesson,
              kind: 'lesson' as const,
              totalPages,
              totalItems,
              totalExercises,
              createdAt: existingLesson?.createdAt || now,
              createdBy: existingLesson?.createdBy || user.uid,
              updatedAt: now,
              updatedBy: user.uid,
              version: (existingLesson?.version || 0) + 1,
              showWordSearch:
                rawLesson.showWordSearch ??
                (typeof existingLesson?.showWordSearch === 'boolean' ? existingLesson.showWordSearch : true),
              isLive: existingLesson?.isLive ?? false,
              liveOrder: existingLesson?.liveOrder ?? null,
              publishedAt: existingLesson?.publishedAt || null,
              publishedBy: existingLesson?.publishedBy || null,
            }
          : {
              ...lesson,
              kind: 'lesson' as const,
              totalPages,
              totalItems,
              totalExercises,
              createdAt: now,
              createdBy: user.uid,
              updatedAt: now,
              updatedBy: user.uid,
              version: 1,
              showWordSearch: rawLesson.showWordSearch ?? false,
              isLive: false,
              liveOrder: null,
              publishedAt: null,
              publishedBy: null,
            }
      );

      await assertLegacyNormalPlacementChangeAllowedInTransaction(
        transaction,
        adminDb,
        lessonExists ? existingLesson : undefined,
        lessonData
      );
      await assertPlacedLessonReplacementAllowedInTransaction(transaction, adminDb, lesson.id, {
        type: lessonData.type,
        pages: lessonData.pages || [],
      });
      const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction,
        adminDb,
        lessonExists ? existingLesson : undefined,
        lessonData
      );
      const assignments = await practiceCategoryService.reconcileLessonCategoriesInTransaction(transaction, {
        lessonId: lesson.id,
        lesson: lessonData,
        ...(practiceCategorySelections !== undefined
          ? { desiredCategorySelections: practiceCategorySelections }
          : { desiredCategoryIds: lessonExists ? practiceCategoryIds : (practiceCategoryIds ?? []) }),
        actorId: user.uid,
      });
      applyVocabularyPoolAssignmentRevisions();
      transaction.set(lessonRef, lessonData);
      transaction.update(recoveryRef, { status: 'recovered', recoveredAt: now });
      return { lessonExists, lessonData, assignments };
    });

    const lesson = result.lessonData;
    console.log(
      `[RECOVERY] ${result.lessonExists ? 'Updated' : 'Created'} lesson "${lesson.title}" (${lesson.id}) from recovery`
    );

    console.log(`[RECOVERY] Successfully recovered lesson "${lesson.title}" (${lesson.id}) by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      lesson: {
        ...result.lessonData,
        practiceCategorySelections: result.assignments.practiceCategorySelections,
        practiceCategoryIds: result.assignments.practiceCategoryIds,
        practiceCategories: result.assignments.practiceCategories,
      },
      message: result.lessonExists
        ? 'Lesson updated successfully from recovery'
        : 'Lesson created successfully from recovery',
    });
  } catch (error) {
    if (error instanceof RecoveryRouteError) {
      return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
    }
    return practiceCategoryRouteErrorResponse(error, 'retry lesson from recovery');
  }
}

// DELETE - Remove/discard recovery item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const recoveryId = id;

    // Get recovery item to verify ownership
    const recoveryDoc = await adminDb.collection('lesson_recovery').doc(recoveryId).get();
    if (!recoveryDoc.exists) {
      return NextResponse.json({ error: 'Recovery item not found' }, { status: 404 });
    }

    const recoveryData = recoveryDoc.data();
    if (recoveryData?.userId !== user.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Mark as discarded instead of deleting (for audit trail)
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
    console.error('Error deleting recovery item:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Failed to delete recovery item' }, { status: 500 });
  }
}
