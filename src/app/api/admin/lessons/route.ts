import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { verifyAdminAccess } from '../../../../lib/verifyAdminAccess';
import { getLessonContentCounts, toLessonSummary } from '@/src/utils/lessonSummary';
import { validateLessonProgression } from '@/src/utils/lessonProgress';
import {
  optionalPracticeCategoryIdsSchema,
  optionalPracticeCategorySelectionsSchema,
} from '@/src/lib/practice-categories/schemas';
import { PracticeCategoryError, practiceCategoryService } from '@/src/lib/practice-categories/service';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import {
  assertLegacyNormalPlacementChangeAllowedInTransaction,
  assertPlacedLessonReplacementAllowedInTransaction,
} from '@/src/lib/learning-units/learning-path-service';

const LESSON_SUMMARY_FIELDS = [
  'title',
  'kind',
  'description',
  'type',
  'vocabulary_pool',
  'showWordSearch',
  'isLive',
  'liveOrder',
  'publishedAt',
  'publishedBy',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'version',
  'totalPages',
  'totalItems',
  'totalExercises',
];

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await adminDb
      .collection('lessons')
      .orderBy('updatedAt', 'desc')
      .select(...LESSON_SUMMARY_FIELDS)
      .get();

    const lessonDocs = snapshot.docs.filter(doc => isLessonDocumentData(doc.data()));
    const lessons = await Promise.all(
      lessonDocs.map(async doc => {
        const data = doc.data() as Partial<Lesson>;

        if (data.totalPages === undefined || data.totalItems === undefined || data.totalExercises === undefined) {
          const fullDoc = await doc.ref.get();
          const fullData = fullDoc.data();
          return isLessonDocumentData(fullData) ? toLessonSummary(doc.id, fullData as Partial<Lesson>) : null;
        }

        return toLessonSummary(doc.id, data);
      })
    );
    const lessonSummaries = lessons.filter((lesson): lesson is NonNullable<typeof lesson> => lesson !== null);

    const assignments = await practiceCategoryService.getAssignmentsForLessonIds(
      lessonSummaries.map(lesson => lesson.id)
    );
    const lessonsWithCategories = lessonSummaries.map(lesson => {
      const assignment = assignments.get(lesson.id)!;
      return {
        ...lesson,
        practiceCategorySelections: assignment.practiceCategorySelections,
        practiceCategoryIds: assignment.practiceCategoryIds,
        practiceCategories: assignment.practiceCategories,
      };
    });
    const liveLessons = lessonsWithCategories.filter(l => l.isLive);
    const availableLessons = lessonsWithCategories.filter(l => !l.isLive);

    return NextResponse.json({
      lessons: lessonsWithCategories,
      liveLessons,
      availableLessons,
    });
  } catch (error) {
    return practiceCategoryRouteErrorResponse(error, 'fetch lessons');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawLesson = (await request.json()) as Lesson;
    if (!isLessonDocumentData(rawLesson)) {
      return NextResponse.json({ error: 'Only lesson documents can use the lesson endpoint' }, { status: 400 });
    }
    if (rawLesson.showWordSearch !== undefined && typeof rawLesson.showWordSearch !== 'boolean') {
      return NextResponse.json({ error: 'showWordSearch must be a boolean' }, { status: 400 });
    }
    const practiceCategorySelections = optionalPracticeCategorySelectionsSchema.parse(
      rawLesson.practiceCategorySelections
    );
    const practiceCategoryIds = optionalPracticeCategoryIdsSchema.parse(rawLesson.practiceCategoryIds);
    const {
      practiceCategorySelections: _practiceCategorySelections,
      practiceCategoryIds: _practiceCategoryIds,
      practiceCategories: _practiceCategories,
      practiceCategoryPlacements: _practiceCategoryPlacements,
      ...lesson
    } = rawLesson;

    if (!lesson.id || !lesson.title || !lesson.type) {
      return NextResponse.json({ error: 'Lesson ID, title, and type are required' }, { status: 400 });
    }

    const { totalPages, totalItems, totalExercises } = getLessonContentCounts(lesson);
    const now = new Date().toISOString();
    const lessonData = {
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
    };

    const lessonRef = adminDb.collection('lessons').doc(lesson.id);
    const assignments = await adminDb.runTransaction(async transaction => {
      const existingLesson = await transaction.get(lessonRef);
      if (existingLesson.exists) {
        throw new PracticeCategoryError('LESSON_ALREADY_EXISTS', 'A lesson with this ID already exists', 409);
      }
      const reconciled = await practiceCategoryService.reconcileLessonCategoriesInTransaction(transaction, {
        lessonId: lesson.id,
        lesson: lessonData,
        ...(practiceCategorySelections !== undefined
          ? { desiredCategorySelections: practiceCategorySelections }
          : { desiredCategoryIds: practiceCategoryIds ?? [] }),
        actorId: user.uid,
      });
      transaction.create(lessonRef, lessonData);
      return reconciled;
    });

    console.log(`Lesson "${lesson.title}" (${lesson.id}) created successfully by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      lesson: {
        ...lessonData,
        practiceCategorySelections: assignments.practiceCategorySelections,
        practiceCategoryIds: assignments.practiceCategoryIds,
        practiceCategories: assignments.practiceCategories,
      },
      message: 'Lesson created successfully',
    });
  } catch (error) {
    console.error('Error creating lesson:', error);
    return practiceCategoryRouteErrorResponse(error, 'create lesson');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawLesson = (await request.json()) as Lesson;
    if (!isLessonDocumentData(rawLesson)) {
      return NextResponse.json({ error: 'Only lesson documents can use the lesson endpoint' }, { status: 400 });
    }
    if (rawLesson.showWordSearch !== undefined && typeof rawLesson.showWordSearch !== 'boolean') {
      return NextResponse.json({ error: 'showWordSearch must be a boolean' }, { status: 400 });
    }
    const practiceCategorySelections = optionalPracticeCategorySelectionsSchema.parse(
      rawLesson.practiceCategorySelections
    );
    const practiceCategoryIds = optionalPracticeCategoryIdsSchema.parse(rawLesson.practiceCategoryIds);
    const {
      practiceCategorySelections: _practiceCategorySelections,
      practiceCategoryIds: _practiceCategoryIds,
      practiceCategories: _practiceCategories,
      practiceCategoryPlacements: _practiceCategoryPlacements,
      ...lesson
    } = rawLesson;

    if (!lesson.id || !lesson.title || !lesson.type) {
      return NextResponse.json({ error: 'Lesson ID, title, and type are required' }, { status: 400 });
    }

    const { totalPages, totalItems, totalExercises } = getLessonContentCounts(lesson);
    const lessonRef = adminDb.collection('lessons').doc(lesson.id);
    const result = await adminDb.runTransaction(async transaction => {
      const existingLessonDoc = await transaction.get(lessonRef);
      if (!existingLessonDoc.exists) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      const existingLessonData = existingLessonDoc.data();
      if (!isLessonDocumentData(existingLessonData)) {
        throw new PracticeCategoryError('LESSON_NOT_FOUND', 'Lesson not found', 404);
      }
      const existingLesson = existingLessonData as Partial<Lesson>;
      await assertLegacyNormalPlacementChangeAllowedInTransaction(transaction, adminDb, existingLesson, {
        ...lesson,
        isLive: existingLesson.isLive ?? false,
        liveOrder: existingLesson.liveOrder ?? null,
        publishedAt: existingLesson.publishedAt ?? null,
        publishedBy: existingLesson.publishedBy ?? null,
      });
      await assertPlacedLessonReplacementAllowedInTransaction(transaction, adminDb, lesson.id, {
        type: lesson.type,
        pages: lesson.pages || [],
      });
      if (existingLesson?.isLive) {
        const progressionErrors = validateLessonProgression({ pages: lesson.pages || [] });
        if (progressionErrors.length > 0) {
          return { progressionErrors } as const;
        }
      }

      const updatedLessonData = {
        ...lesson,
        kind: 'lesson' as const,
        totalPages,
        totalItems,
        totalExercises,
        createdAt: existingLesson?.createdAt || new Date().toISOString(),
        createdBy: existingLesson?.createdBy || user.uid,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        version: (existingLesson?.version || 0) + 1,
        showWordSearch:
          rawLesson.showWordSearch ??
          (typeof existingLesson?.showWordSearch === 'boolean' ? existingLesson.showWordSearch : true),
        isLive: existingLesson?.isLive ?? false,
        liveOrder: existingLesson?.liveOrder ?? null,
        publishedAt: existingLesson?.publishedAt || null,
        publishedBy: existingLesson?.publishedBy || null,
      };
      const assignments = await practiceCategoryService.reconcileLessonCategoriesInTransaction(transaction, {
        lessonId: lesson.id,
        lesson: updatedLessonData,
        ...(practiceCategorySelections !== undefined
          ? { desiredCategorySelections: practiceCategorySelections }
          : { desiredCategoryIds: practiceCategoryIds }),
        actorId: user.uid,
      });
      transaction.set(lessonRef, updatedLessonData);
      return { updatedLessonData, assignments } as const;
    });

    if ('progressionErrors' in result) {
      return NextResponse.json(
        { error: `Cannot update live lesson ${lesson.id}`, progressionErrors: result.progressionErrors },
        { status: 400 }
      );
    }

    console.log(`Lesson "${lesson.title}" (${lesson.id}) updated successfully by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      lesson: {
        ...result.updatedLessonData,
        practiceCategorySelections: result.assignments.practiceCategorySelections,
        practiceCategoryIds: result.assignments.practiceCategoryIds,
        practiceCategories: result.assignments.practiceCategories,
      },
      message: 'Lesson updated successfully',
    });
  } catch (error) {
    console.error('Error updating lesson:', error);
    return practiceCategoryRouteErrorResponse(error, 'update lesson');
  }
}
