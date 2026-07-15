import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';
import { verifyAdminAccess } from '../../../../lib/verifyAdminAccess';
import { getLessonContentCounts, toLessonSummary } from '@/src/utils/lessonSummary';
import { validateLessonProgression } from '@/src/utils/lessonProgress';
import { optionalPracticeCategoryIdsSchema } from '@/src/lib/practice-categories/schemas';
import { PracticeCategoryError, practiceCategoryService } from '@/src/lib/practice-categories/service';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';

const LESSON_SUMMARY_FIELDS = [
  'title',
  'description',
  'type',
  'vocabulary_pool',
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

    const lessons = await Promise.all(
      snapshot.docs.map(async doc => {
        const data = doc.data() as Partial<Lesson>;

        if (data.totalPages === undefined || data.totalItems === undefined || data.totalExercises === undefined) {
          const fullDoc = await doc.ref.get();
          return toLessonSummary(doc.id, fullDoc.data() as Partial<Lesson>);
        }

        return toLessonSummary(doc.id, data);
      })
    );

    const assignments = await practiceCategoryService.getAssignmentsForLessonIds(lessons.map(lesson => lesson.id));
    const lessonsWithCategories = lessons.map(lesson => {
      const assignment = assignments.get(lesson.id)!;
      return {
        ...lesson,
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
    const practiceCategoryIds = optionalPracticeCategoryIdsSchema.parse(rawLesson.practiceCategoryIds);
    const { practiceCategoryIds: _practiceCategoryIds, practiceCategories: _practiceCategories, ...lesson } = rawLesson;

    if (!lesson.id || !lesson.title || !lesson.type) {
      return NextResponse.json({ error: 'Lesson ID, title, and type are required' }, { status: 400 });
    }

    const { totalPages, totalItems, totalExercises } = getLessonContentCounts(lesson);
    const now = new Date().toISOString();
    const lessonData = {
      ...lesson,
      totalPages,
      totalItems,
      totalExercises,
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
      version: 1,
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
        desiredCategoryIds: practiceCategoryIds ?? [],
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
    const practiceCategoryIds = optionalPracticeCategoryIdsSchema.parse(rawLesson.practiceCategoryIds);
    const { practiceCategoryIds: _practiceCategoryIds, practiceCategories: _practiceCategories, ...lesson } = rawLesson;

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
      const existingLesson = existingLessonDoc.data();
      if (existingLesson?.isLive) {
        const progressionErrors = validateLessonProgression({ pages: lesson.pages || [] });
        if (progressionErrors.length > 0) {
          return { progressionErrors } as const;
        }
      }

      const updatedLessonData = {
        ...lesson,
        totalPages,
        totalItems,
        totalExercises,
        createdAt: existingLesson?.createdAt || new Date().toISOString(),
        createdBy: existingLesson?.createdBy || user.uid,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        version: (existingLesson?.version || 0) + 1,
        isLive: existingLesson?.isLive ?? false,
        liveOrder: existingLesson?.liveOrder ?? null,
        publishedAt: existingLesson?.publishedAt || null,
        publishedBy: existingLesson?.publishedBy || null,
      };
      const assignments = await practiceCategoryService.reconcileLessonCategoriesInTransaction(transaction, {
        lessonId: lesson.id,
        lesson: updatedLessonData,
        desiredCategoryIds: practiceCategoryIds,
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
