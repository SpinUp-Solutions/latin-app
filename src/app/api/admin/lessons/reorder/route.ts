import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessons } = await request.json();

    if (!Array.isArray(lessons)) {
      return NextResponse.json({ error: 'Lessons array is required' }, { status: 400 });
    }

    const batch = adminDb.batch();

    for (const lesson of lessons) {
      if (!lesson.lessonId || lesson.order === undefined) {
        return NextResponse.json({ error: 'Invalid lesson data' }, { status: 400 });
      }

      const lessonRef = adminDb.collection('lessons').doc(lesson.lessonId);
      batch.update(lessonRef, { liveOrder: lesson.order });
    }

    await batch.commit();

    console.log(`Reordered ${lessons.length} lessons by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lessons reordered successfully',
    });
  } catch (error) {
    console.error('Error reordering lessons:', error);
    return NextResponse.json({ error: 'Failed to reorder lessons' }, { status: 500 });
  }
}