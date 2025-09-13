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

    const batch = adminDb.batch();
    let processedCount = 0;

    for (const lessonId of lessonIds) {
      const lessonRef = adminDb.collection('lessons').doc(lessonId);
      const lessonDoc = await lessonRef.get();

      if (lessonDoc.exists && lessonDoc.data()?.isLive) {
        batch.update(lessonRef, {
          isLive: false,
          liveOrder: null,
          publishedAt: null,
          publishedBy: null,
        });
        processedCount++;
      }
    }

    await batch.commit();

    console.log(`Batch unpublished ${processedCount} lessons by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: `Successfully unpublished ${processedCount} lessons`,
      processedCount,
    });
  } catch (error) {
    console.error('Error batch unpublishing lessons:', error);
    return NextResponse.json({ error: 'Failed to unpublish lessons' }, { status: 500 });
  }
}