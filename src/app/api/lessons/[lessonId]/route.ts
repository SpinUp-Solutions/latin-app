import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { auth } from 'firebase-admin';
import { LessonWithProgress, UserProgress } from '@/src/types/lesson';
import { isLessonComplete } from '@/src/utils/lessonUtils';

async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    return await auth().verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: { lessonId: string } }) {
  try {
    const { lessonId } = params;

    if (!lessonId) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    const currentUser = await verifyAuth(request);

    const lessonDoc = await adminDb.collection('lessons').doc(lessonId).get();

    if (!lessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const lessonData = lessonDoc.data();

    if (!lessonData?.isLive) {
      return NextResponse.json({ error: 'Lesson not published' }, { status: 404 });
    }

    if (currentUser) {
      const [allLessonsSnapshot, userProgressSnapshot] = await Promise.all([
        adminDb.collection('lessons').where('isLive', '==', true).orderBy('liveOrder', 'asc').get(),
        adminDb.collection('userProgress').where('userId', '==', currentUser.uid).get(),
      ]);

      const allLessons = allLessonsSnapshot.docs.map(doc => ({
        id: doc.id,
        liveOrder: doc.data().liveOrder,
        pages: doc.data().pages || [],
      }));

      const userProgressMap: Record<string, UserProgress> = {};
      userProgressSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const progressLessonId = data.lessonId || doc.id.split('_')[1];
        if (progressLessonId) {
          userProgressMap[progressLessonId] = data as UserProgress;
        }
      });

      const currentLessonIndex = allLessons.findIndex(l => l.id === lessonId);

      if (currentLessonIndex > 0) {
        const previousLesson = allLessons[currentLessonIndex - 1];
        const previousProgress = userProgressMap[previousLesson.id];

        if (!previousProgress) {
          return NextResponse.json({
            error: 'Lesson is locked. Complete the previous lesson first.'
          }, { status: 403 });
        }

        const prevCurrentPageIndex = previousProgress.currentPageIndex || 0;
        const prevTotalPages = previousLesson.pages.length;
        const isPreviousComplete = isLessonComplete(prevCurrentPageIndex, prevTotalPages);

        if (!isPreviousComplete) {
          return NextResponse.json({
            error: 'Lesson is locked. Complete the previous lesson first.'
          }, { status: 403 });
        }
      }
    }

    const lesson: LessonWithProgress = {
      id: lessonDoc.id,
      ...lessonData,
      progress: 0,
      status: 'available',
    } as LessonWithProgress;

    return NextResponse.json({ lesson });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 });
  }
}
