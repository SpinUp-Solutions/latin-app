import { NextRequest, NextResponse } from 'next/server';
import { LEARNING_UNITS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { saveLesson } from '@/src/lib/learning-units/lesson-save.server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { LESSON_SUMMARY_FIELDS, toLessonSummary } from '@/src/utils/lessonSummary';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';
import { routeErrorResponse } from '@/src/lib/route-error-response';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    const snapshot = await adminDb
      .collection(LEARNING_UNITS_COLLECTION)
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
    return routeErrorResponse(error, 'fetch lessons');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    const { lesson } = await saveLesson(await request.json(), user.uid, 'create');

    console.log(`Lesson "${lesson.title}" (${lesson.id}) created successfully by user ${user.uid}`);

    return NextResponse.json({ success: true, lesson, message: 'Lesson created successfully' });
  } catch (error) {
    return routeErrorResponse(error, 'create lesson');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    const { lesson } = await saveLesson(await request.json(), user.uid, 'update');

    console.log(`Lesson "${lesson.title}" (${lesson.id}) updated successfully by user ${user.uid}`);

    return NextResponse.json({ success: true, lesson, message: 'Lesson updated successfully' });
  } catch (error) {
    return routeErrorResponse(error, 'update lesson');
  }
}
