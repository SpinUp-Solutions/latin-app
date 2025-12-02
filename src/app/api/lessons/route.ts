import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { auth } from 'firebase-admin';
import { LessonWithProgress, UserProgress } from '@/src/types/lesson';
import { calculateProgressFromPageIndex, isLessonComplete } from '@/src/utils/lessonUtils';

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    const currentUser = await verifyAuth(request);

    const snapshot = await adminDb.collection('lessons').where('isLive', '==', true).orderBy('liveOrder', 'asc').get();

    if (snapshot.empty) {
      return NextResponse.json({ lessons: [] });
    }

    const allLessons = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        type: data.type || 'normal',
        vocabulary_pool: data.vocabulary_pool,
        pages: data.pages || [],
        isLive: data.isLive,
        liveOrder: data.liveOrder,
        publishedAt: data.publishedAt,
        publishedBy: data.publishedBy,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
        version: data.version,
      };
    });

    const userProgressMap: Record<string, UserProgress> = {};

    if (currentUser) {
      const progressSnapshot = await adminDb.collection('userProgress').where('userId', '==', currentUser.uid).get();

      progressSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const lessonId = data.lessonId || doc.id.split('_')[1];
        if (lessonId) {
          userProgressMap[lessonId] = data as UserProgress;
        }
      });
    }

    const normalLessons = allLessons.filter(l => l.type === 'normal');
    const vocabLessons = allLessons.filter(l => l.type === 'vocab');

    const processNormalLessons = (lessons: typeof allLessons): LessonWithProgress[] => {
      return lessons.map((lesson, index) => {
        const userProgress = userProgressMap[lesson.id];
        let status = 'locked';
        let progress = 0;

        if (!currentUser) {
          status = 'available';
        } else if (index === 0) {
          if (userProgress) {
            const currentPageIndex = userProgress.currentPageIndex || 0;
            const totalPages = lesson.pages.length;
            progress = calculateProgressFromPageIndex(currentPageIndex, totalPages);
            const isComplete = isLessonComplete(currentPageIndex, totalPages);
            status = isComplete ? 'completed' : currentPageIndex > 0 ? 'in-progress' : 'available';
          } else {
            status = 'available';
          }
        } else {
          const previousLesson = lessons[index - 1];
          const previousProgress = userProgressMap[previousLesson.id];

          if (previousProgress) {
            const prevCurrentPageIndex = previousProgress.currentPageIndex || 0;
            const prevTotalPages = previousLesson.pages.length;
            const isPreviousComplete = isLessonComplete(prevCurrentPageIndex, prevTotalPages);

            if (isPreviousComplete) {
              if (userProgress) {
                const currentPageIndex = userProgress.currentPageIndex || 0;
                const totalPages = lesson.pages.length;
                progress = calculateProgressFromPageIndex(currentPageIndex, totalPages);
                const isComplete = isLessonComplete(currentPageIndex, totalPages);
                status = isComplete ? 'completed' : currentPageIndex > 0 ? 'in-progress' : 'available';
              } else {
                status = 'available';
              }
            }
          }
        }

        return {
          ...lesson,
          progress,
          status,
          currentPageIndex: userProgress?.currentPageIndex || 0,
          exerciseProgress: userProgress?.exerciseProgress || [],
          completedAt: userProgress?.completedAt,
          score: userProgress?.score,
          lastAccessedAt: userProgress?.lastAccessedAt,
        } as LessonWithProgress;
      });
    };

    const processVocabLessons = (lessons: typeof allLessons): LessonWithProgress[] => {
      return lessons.map(lesson => {
        const userProgress = userProgressMap[lesson.id];
        const status = userProgress?.status === 'completed' ? 'completed' : 'available';
        const progress = status === 'completed' ? 100 : 0;

        return {
          ...lesson,
          progress,
          status,
          currentPageIndex: 0,
          exerciseProgress: [],
          completedAt: userProgress?.completedAt,
          score: userProgress?.score,
          lastAccessedAt: userProgress?.lastAccessedAt,
        } as LessonWithProgress;
      });
    };

    const lessonsWithStatus: LessonWithProgress[] = [
      ...processNormalLessons(normalLessons),
      ...processVocabLessons(vocabLessons),
    ];

    return NextResponse.json({ lessons: lessonsWithStatus });
  } catch (error) {
    console.error('Error fetching live lessons:', error);
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}
