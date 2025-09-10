import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { LiveLesson } from '@/src/types/live-lesson';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, lessonIds } = await request.json();

    if (!action || !Array.isArray(lessonIds) || lessonIds.length === 0) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    if (action !== 'publish' && action !== 'unpublish') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const batch = adminDb.batch();
    const timestamp = new Date().toISOString();
    let processedCount = 0;

    if (action === 'publish') {
      // Get current max order
      const highestOrderDoc = await adminDb.collection('live_lessons').orderBy('order', 'desc').limit(1).get();

      let nextOrder = highestOrderDoc.empty ? 0 : highestOrderDoc.docs[0].data().order + 1;

      for (const lessonId of lessonIds) {
        // Check if lesson exists
        const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();
        if (!lessonDoc.exists) {
          console.warn(`Lesson ${lessonId} not found, skipping`);
          continue;
        }

        // Check if already published
        const existingLiveLesson = await adminDb.collection('live_lessons').doc(lessonId).get();
        if (existingLiveLesson.exists) {
          console.warn(`Lesson ${lessonId} is already live, skipping`);
          continue;
        }

        const liveLesson: LiveLesson = {
          lessonId,
          order: nextOrder++,
          publishedAt: timestamp,
          publishedBy: user.uid,
        };

        batch.set(adminDb.collection('live_lessons').doc(lessonId), liveLesson);
        processedCount++;
      }
    } else {
      // Unpublish
      for (const lessonId of lessonIds) {
        const liveLessonRef = adminDb.collection('live_lessons').doc(lessonId);
        const liveLessonDoc = await liveLessonRef.get();

        if (!liveLessonDoc.exists) {
          console.warn(`Live lesson ${lessonId} not found, skipping`);
          continue;
        }

        batch.delete(liveLessonRef);
        processedCount++;
      }
    }

    await batch.commit();

    console.log(`Batch ${action} completed: ${processedCount} lessons processed by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: `Successfully ${action}ed ${processedCount} lesson${processedCount !== 1 ? 's' : ''}`,
      processedCount,
    });
  } catch (error) {
    console.error('Error in batch operation:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to process batch operation' }, { status: 500 });
  }
}
