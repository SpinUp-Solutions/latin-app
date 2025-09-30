import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { auth } from 'firebase-admin';
import { calculateProgressFromPageIndex, isLessonComplete } from '@/src/utils/lessonUtils';

async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No authorization header');
  }

  const token = authHeader.substring(7);
  return await auth().verifyIdToken(token);
}

export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const currentUser = await verifyAuth(request);

    if (currentUser.uid !== params.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [progressCollection, lessonsCollection] = await Promise.all([
      adminDb.collection('userProgress').where('userId', '==', params.userId).get(),
      adminDb.collection('lessons').where('isLive', '==', true).get(),
    ]);

    if (progressCollection.empty) {
      return NextResponse.json({});
    }

    const lessonsMap = new Map();
    lessonsCollection.docs.forEach(doc => {
      const data = doc.data();
      lessonsMap.set(doc.id, {
        id: doc.id,
        totalPages: data.pages?.length || 0,
        ...data,
      });
    });

    const progressMap: Record<string, unknown> = {};

    progressCollection.docs.forEach(doc => {
      const data = doc.data();
      const lessonId = data.lessonId || doc.id.split('_')[1];

      if (lessonId && lessonsMap.has(lessonId)) {
        const lesson = lessonsMap.get(lessonId);
        const currentPageIndex = data.currentPageIndex || 0;
        const totalPages = lesson.totalPages;

        const progress = calculateProgressFromPageIndex(currentPageIndex, totalPages);
        const isComplete = isLessonComplete(currentPageIndex, totalPages);

        progressMap[lessonId] = {
          ...data,
          userId: params.userId,
          lessonId,
          exerciseProgress: data.exerciseProgress || [],
          currentPageIndex,
          progress,
          status: isComplete ? 'completed' : data.status === 'not-started' ? 'available' : data.status || 'available',
        };
      }
    });

    return NextResponse.json(progressMap);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}
