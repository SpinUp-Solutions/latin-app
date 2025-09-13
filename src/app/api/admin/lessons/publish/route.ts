import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonId, order } = await request.json();

    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();
    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    if (lessonDoc.data()?.isLive) {
      return NextResponse.json({ error: 'Lesson is already live' }, { status: 409 });
    }

    let finalOrder = order;
    if (finalOrder === undefined) {
      const liveLessonsSnapshot = await adminDb.collection('lessons')
        .where('isLive', '==', true)
        .orderBy('liveOrder', 'desc')
        .limit(1)
        .get();

      finalOrder = liveLessonsSnapshot.empty ? 0 : liveLessonsSnapshot.docs[0].data().liveOrder + 1;
    }

    await adminDb.collection('lessons').doc(lessonId).update({
      isLive: true,
      liveOrder: finalOrder,
      publishedAt: new Date().toISOString(),
      publishedBy: user.uid,
    });

    console.log(`Lesson ${lessonId} published as live by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lesson published successfully',
    });
  } catch (error) {
    console.error('Error publishing lesson:', error);
    return NextResponse.json({ error: 'Failed to publish lesson' }, { status: 500 });
  }
}