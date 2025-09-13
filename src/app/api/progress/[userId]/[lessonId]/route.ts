import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { auth } from 'firebase-admin';

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
    const { exerciseId, score, ...lessonProgressData } = progressData;

    if (exerciseId && typeof score === 'number') {
      const progressDoc = await adminDb.collection('userProgress').doc(`${params.userId}_${params.lessonId}`).get();
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

      await adminDb
        .collection('userProgress')
        .doc(`${params.userId}_${params.lessonId}`)
        .set(
          {
            ...existingData,
            ...lessonProgressData,
            exerciseProgress,
            userId: params.userId,
            lessonId: params.lessonId,
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
