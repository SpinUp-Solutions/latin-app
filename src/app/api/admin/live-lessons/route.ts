import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { LiveLesson, LiveLessonWithData } from '@/src/types/live-lesson';
import { Lesson } from '@/src/types/lesson';

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all live lessons
    const liveLessonsSnapshot = await adminDb
      .collection('live_lessons')
      .orderBy('order', 'asc')
      .get();

    const liveLessonIds = new Set<string>();
    const liveLessons: LiveLesson[] = [];

    liveLessonsSnapshot.docs.forEach(doc => {
      const data = doc.data() as LiveLesson;
      liveLessonIds.add(data.lessonId);
      liveLessons.push(data);
    });

    // Get all lessons from lessons collection
    const allLessonsSnapshot = await adminDb
      .collection('lessons')
      .orderBy('updatedAt', 'desc')
      .get();

    const availableLessons: Lesson[] = [];
    const lessonMap = new Map<string, Lesson>();

    allLessonsSnapshot.docs.forEach(doc => {
      const lesson = { id: doc.id, ...doc.data() } as Lesson;
      lessonMap.set(doc.id, lesson);
      
      // Only add to available if not already live
      if (!liveLessonIds.has(doc.id)) {
        availableLessons.push(lesson);
      }
    });

    // Populate live lessons with full lesson data
    const liveLessonsWithData: LiveLessonWithData[] = liveLessons
      .map(liveLesson => ({
        ...liveLesson,
        lessonData: lessonMap.get(liveLesson.lessonId)!,
      }))
      .filter(lesson => lesson.lessonData); // Filter out any with missing data

    return NextResponse.json({
      liveLessons: liveLessonsWithData,
      availableLessons,
    });
  } catch (error) {
    console.error('Error fetching live lessons:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch live lessons' }, { status: 500 });
  }
}

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

    // Check if lesson exists
    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();
    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    // Check if already published
    const existingLiveLesson = await adminDb
      .collection('live_lessons')
      .where('lessonId', '==', lessonId)
      .get();

    if (!existingLiveLesson.empty) {
      return NextResponse.json({ error: 'Lesson is already live' }, { status: 409 });
    }

    // Get the highest order number if not provided
    let finalOrder = order;
    if (finalOrder === undefined) {
      const highestOrderDoc = await adminDb
        .collection('live_lessons')
        .orderBy('order', 'desc')
        .limit(1)
        .get();

      finalOrder = highestOrderDoc.empty ? 0 : highestOrderDoc.docs[0].data().order + 1;
    }

    // Create live lesson document
    const liveLesson: LiveLesson = {
      lessonId,
      order: finalOrder,
      publishedAt: new Date().toISOString(),
      publishedBy: user.uid,
    };

    await adminDb.collection('live_lessons').doc(lessonId).set(liveLesson);

    console.log(`Lesson ${lessonId} published as live by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Lesson published successfully',
    });
  } catch (error) {
    console.error('Error publishing lesson:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to publish lesson' }, { status: 500 });
  }
}