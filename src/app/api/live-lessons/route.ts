import { NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { LiveLessonWithData } from '@/src/types/live-lesson';

export async function GET() {
  try {
    // Verify user is authenticated (student or admin)

    // Get all live lessons ordered by their order field
    const liveLessonsSnapshot = await adminDb.collection('live_lessons').orderBy('order', 'asc').get();

    if (liveLessonsSnapshot.empty) {
      return NextResponse.json({ lessons: [] });
    }

    // Get lesson IDs
    const lessonIds = liveLessonsSnapshot.docs.map(doc => doc.data().lessonId);

    // Fetch all lesson data in batch
    const lessonPromises = lessonIds.map(id => adminDb.collection('lessons').doc(id).get());

    const lessonDocs = await Promise.all(lessonPromises);

    // Build the response with populated lesson data
    const lessons: LiveLessonWithData[] = liveLessonsSnapshot.docs
      .map((liveLessonDoc, index) => {
        const liveLesson = liveLessonDoc.data();
        const lessonDoc = lessonDocs[index];

        if (!lessonDoc.exists) {
          return null;
        }

        const lessonData = {
          id: lessonDoc.id,
          ...lessonDoc.data(),
        };

        // TODO: Add user progress tracking here
        // For now, return mock progress data
        const progress = 0; // Will be fetched from user_progress collection
        const status = progress === 0 ? 'available' : progress === 100 ? 'completed' : 'in-progress';

        return {
          ...liveLesson,
          lessonData,
          progress,
          status,
        } as LiveLessonWithData;
      })
      .filter(lesson => lesson !== null);

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error('Error fetching live lessons:', error);
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}
