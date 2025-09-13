import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonId } = await request.json();

    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();
    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    if (!lessonDoc.data()?.isLive) {
      return NextResponse.json({ error: 'Lesson is not live' }, { status: 409 });
    }

    await adminDb.collection('lessons').doc(lessonId).update({
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
    });

    console.log(`Lesson ${lessonId} unpublished by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lesson unpublished successfully',
    });
  } catch (error) {
    console.error('Error unpublishing lesson:', error);
    return NextResponse.json({ error: 'Failed to unpublish lesson' }, { status: 500 });
  }
}