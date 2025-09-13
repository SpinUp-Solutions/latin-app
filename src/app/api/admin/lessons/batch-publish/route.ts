import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonIds } = await request.json();

    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return NextResponse.json({ error: 'Lesson IDs array is required' }, { status: 400 });
    }

    const liveLessonsSnapshot = await adminDb.collection('lessons')
      .where('isLive', '==', true)
      .orderBy('liveOrder', 'desc')
      .limit(1)
      .get();

    let nextOrder = liveLessonsSnapshot.empty ? 0 : liveLessonsSnapshot.docs[0].data().liveOrder + 1;

    const batch = adminDb.batch();
    let processedCount = 0;

    for (const lessonId of lessonIds) {
      const lessonRef = adminDb.collection('lessons').doc(lessonId);
      const lessonDoc = await lessonRef.get();

      if (lessonDoc.exists && !lessonDoc.data()?.isLive) {
        batch.update(lessonRef, {
          isLive: true,
          liveOrder: nextOrder,
          publishedAt: new Date().toISOString(),
          publishedBy: user.uid,
        });
        nextOrder++;
        processedCount++;
      }
    }

    await batch.commit();

    console.log(`Batch published ${processedCount} lessons by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: `Successfully published ${processedCount} lessons`,
      processedCount,
    });
  } catch (error) {
    console.error('Error batch publishing lessons:', error);
    return NextResponse.json({ error: 'Failed to publish lessons' }, { status: 500 });
  }
}