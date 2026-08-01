import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { practiceCategoryRouteErrorResponse } from '@/src/lib/practice-categories/api';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lessonDoc = await adminDb.collection('lessons').doc(id).get();

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
    return practiceCategoryRouteErrorResponse(error, 'fetch lesson');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    return practiceCategoryRouteErrorResponse(error, 'delete lesson');
  }
}
