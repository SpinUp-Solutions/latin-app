import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { auth } from 'firebase-admin';
import {
  isLessonComplete,
  parsePageIndex,
  getExerciseCountForPage,
  getCompletedExercisesForPage,
} from '@/src/utils/lessonUtils';
import { Lesson } from '@/src/types/lesson';

async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('No authorization header');
  }

  const token = authHeader.substring(7);
  return await auth().verifyIdToken(token);
}

export async function GET(request: NextRequest, { params }: { params: { userId: string; lessonId: string } }) {
  try {
    const currentUser = await verifyAuth(request);

    if (currentUser.uid !== params.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progressDoc = await adminDb.collection('userProgress').doc(`${params.userId}_${params.lessonId}`).get();

    if (!progressDoc.exists) {
      return NextResponse.json(null);
    }

    return NextResponse.json(progressDoc.data());
  } catch (error) {
    console.error('Error fetching user progress:', error);
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { userId: string; lessonId: string } }) {
  try {
    const currentUser = await verifyAuth(request);

    if (currentUser.uid !== params.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progressData = await request.json();
    const { exerciseId, score, currentPageIndex: directPageIndex, ...lessonProgressData } = progressData;

    if (exerciseId && typeof score === 'number') {
      const [progressDoc, lessonDoc] = await Promise.all([
        adminDb.collection('userProgress').doc(`${params.userId}_${params.lessonId}`).get(),
        adminDb.collection('lessons').doc(params.lessonId).get(),
      ]);

      const existingData = progressDoc.exists ? progressDoc.data() : {};
      const exerciseProgress = existingData?.exerciseProgress || [];

      const existingIndex = exerciseProgress.findIndex((ep: { exerciseId: string }) => ep.exerciseId === exerciseId);
      const newExerciseProgress = {
        exerciseId,
        completedAt: new Date().toISOString(),
        score,
      };

      if (existingIndex >= 0) {
        exerciseProgress[existingIndex] = newExerciseProgress;
      } else {
        exerciseProgress.push(newExerciseProgress);
      }

      // Update currentPageIndex when advancing to new furthest page
      let currentPageIndex = existingData?.currentPageIndex || 0;
      const pageIndex = parsePageIndex(exerciseId);
      if (pageIndex !== null && lessonDoc.exists) {
        const lesson = { id: lessonDoc.id, ...lessonDoc.data() } as Lesson;
        const totalExercisesOnPage = getExerciseCountForPage(lesson, pageIndex);
        const completedExercisesOnPage = getCompletedExercisesForPage(exerciseProgress, pageIndex);

        if (completedExercisesOnPage.length === totalExercisesOnPage && totalExercisesOnPage > 0) {
          // All exercises on this page are complete, advance to next page
          const nextPageIndex = pageIndex + 1;
          currentPageIndex = Math.max(currentPageIndex, nextPageIndex);
        }
      }

      let computedData = {};
      if (lessonDoc.exists) {
        const lesson = { id: lessonDoc.id, ...lessonDoc.data() } as Lesson;
        const totalPages = lesson.pages.length;
        const isComplete = isLessonComplete(currentPageIndex, totalPages);

        computedData = {
          currentPageIndex,
          status: isComplete ? 'completed' : 'in-progress',
          lastAccessedAt: new Date().toISOString(),
        };
      }

      await adminDb
        .collection('userProgress')
        .doc(`${params.userId}_${params.lessonId}`)
        .set(
          {
            ...existingData,
            ...lessonProgressData,
            exerciseProgress,
            ...computedData,
            userId: params.userId,
            lessonId: params.lessonId,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    } else if (directPageIndex !== undefined) {
      const existingDoc = await adminDb.collection('userProgress').doc(`${params.userId}_${params.lessonId}`).get();
      const existingData = existingDoc.exists ? existingDoc.data() : {};

      await adminDb
        .collection('userProgress')
        .doc(`${params.userId}_${params.lessonId}`)
        .set(
          {
            ...existingData,
            currentPageIndex: directPageIndex,
            userId: params.userId,
            lessonId: params.lessonId,
            lastAccessedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    } else {
      await adminDb
        .collection('userProgress')
        .doc(`${params.userId}_${params.lessonId}`)
        .set(
          {
            ...progressData,
            userId: params.userId,
            lessonId: params.lessonId,
            lastAccessedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user progress:', error);
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 });
  }
}
