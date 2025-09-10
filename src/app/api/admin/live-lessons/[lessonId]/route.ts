import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function DELETE(request: NextRequest, { params }: { params: { lessonId: string } }) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonId } = params;

    // Check if live lesson exists
    const liveLessonDoc = await adminDb.collection('live_lessons').doc(lessonId).get();

    if (!liveLessonDoc.exists) {
      return NextResponse.json({ error: 'Live lesson not found' }, { status: 404 });
    }

    // Delete the live lesson document
    await adminDb.collection('live_lessons').doc(lessonId).delete();

    console.log(`Lesson ${lessonId} unpublished by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lesson unpublished successfully',
    });
  } catch (error) {
    console.error('Error unpublishing lesson:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to unpublish lesson' }, { status: 500 });
  }
}
