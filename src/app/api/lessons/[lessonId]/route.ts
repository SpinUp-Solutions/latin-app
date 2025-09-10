import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { LiveLessonWithData } from '@/src/types/live-lesson';

export async function GET(request: NextRequest, { params }: { params: { lessonId: string } }) {
  try {
    const { lessonId } = params;

    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    // First check if this lesson is published in live_lessons
    const liveLessonsSnapshot = await adminDb.collection('live_lessons').where('lessonId', '==', lessonId).get();

    if (liveLessonsSnapshot.empty) {
      return NextResponse.json({ error: 'Lesson not found or not published' }, { status: 404 });
    }

    // Get the live lesson data
    const liveLessonData = liveLessonsSnapshot.docs[0].data();

    // Fetch the lesson data from lessons collection
    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();

    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson data not found' }, { status: 404 });
    }

    const lessonData = {
      id: lessonDoc.id,
      ...lessonDoc.data(),
    };

    // TODO: Add user progress tracking here
    // For now, return mock progress data
    const progress = 0; // Will be fetched from user_progress collection
    const status = progress === 0 ? 'available' : progress === 100 ? 'completed' : 'in-progress';

    const lesson: LiveLessonWithData = {
      ...liveLessonData,
      lessonData,
      progress,
      status,
    } as LiveLessonWithData;

    return NextResponse.json({ lesson });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 });
  }
}
