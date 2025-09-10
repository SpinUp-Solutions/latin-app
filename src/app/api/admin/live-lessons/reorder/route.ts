import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function PUT(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessons } = await request.json();

    if (!Array.isArray(lessons)) {
      return NextResponse.json({ error: 'Invalid lessons array' }, { status: 400 });
    }

    // Update each lesson's order
    const batch = adminDb.batch();

    for (const lesson of lessons) {
      if (!lesson.lessonId || typeof lesson.order !== 'number') {
        return NextResponse.json({ error: 'Invalid lesson data' }, { status: 400 });
      }

      const docRef = adminDb.collection('live_lessons').doc(lesson.lessonId);
      batch.update(docRef, { order: lesson.order });
    }

    await batch.commit();

    console.log(`Live lessons reordered by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lessons reordered successfully',
    });
  } catch (error) {
    console.error('Error reordering lessons:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to reorder lessons' }, { status: 500 });
  }
}
