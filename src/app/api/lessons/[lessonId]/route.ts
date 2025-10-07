import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { LessonWithProgress } from '@/src/types/lesson';

export async function GET(request: NextRequest, { params }: { params: { lessonId: string } }) {
  try {
    const { lessonId } = params;

    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();

    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const lessonData = lessonDoc.data();
    
    if (!lessonData?.isLive) {
      return NextResponse.json({ error: 'Lesson not published' }, { status: 404 });
    }

    const progress = 0;
    const status = progress === 0 ? 'available' : progress === 100 ? 'completed' : 'in-progress';

    const lesson: LessonWithProgress = {
      id: lessonDoc.id,
      ...lessonData,
      progress,
      status,
    } as LessonWithProgress;

    return NextResponse.json({ lesson });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 });
  }
}
