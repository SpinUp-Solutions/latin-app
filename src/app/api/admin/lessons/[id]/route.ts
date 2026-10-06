import { NextRequest, NextResponse } from 'next/server';
import { LEARNING_UNITS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyAdminAccess(request);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lessonDoc = await adminDb.collection(LEARNING_UNITS_COLLECTION).doc(id).get();

    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }
    if (!isLessonDocumentData(lessonDoc.data())) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const assignments = await practiceCategoryService.getLessonCategories(id);
    const lesson = {
      id: lessonDoc.id,
      ...lessonDoc.data(),
      practiceCategorySelections: assignments.practiceCategorySelections,
      practiceCategoryIds: assignments.practiceCategoryIds,
      practiceCategories: assignments.practiceCategories,
    };

    return NextResponse.json({ lesson });
  } catch (error) {
    return routeErrorResponse(error, 'fetch lesson');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAdminAccess(request);

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const deletedMembershipCount = await practiceCategoryService.deleteLessonWithMemberships(id, user.uid);

    console.log(`Lesson ${id} deleted successfully by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      deletedMembershipCount,
      message: 'Lesson deleted successfully',
    });
  } catch (error) {
    return routeErrorResponse(error, 'delete lesson');
  }
}
