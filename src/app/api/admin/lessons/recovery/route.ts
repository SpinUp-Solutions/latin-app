import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';

export interface RecoveryItem {
  id: string;
  lessonId: string;
  lessonTitle: string;
  rawLessonData: Lesson;
  errorMessage: string;
  errorCode?: string;
  userId: string;
  createdAt: string;
  status: 'pending' | 'recovered' | 'discarded';
}

// GET - List recovery items for current user
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);

    const snapshot = await adminDb
      .collection('lesson_recovery')
      .where('userId', '==', user.uid)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();

    const recoveryItems: RecoveryItem[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<RecoveryItem, 'id'>),
    }));

    return NextResponse.json({ recoveryItems });
  } catch (error) {
    return routeErrorResponse(error, 'fetch recovery items');
  }
}

// POST - Save lesson to recovery collection
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);

    const { lesson, errorMessage, errorCode } = (await request.json()) as {
      lesson: Lesson;
      errorMessage: string;
      errorCode?: string;
    };

    if (!lesson || !lesson.id) {
      return NextResponse.json({ error: 'Lesson data is required' }, { status: 400 });
    }

    const recoveryDoc = {
      lessonId: lesson.id,
      lessonTitle: lesson.title || 'Untitled Lesson',
      rawLessonData: lesson,
      errorMessage: errorMessage || 'Unknown error',
      errorCode: errorCode || 'unknown',
      userId: user.uid,
      createdAt: new Date().toISOString(),
      status: 'pending' as const,
    };

    const docRef = await adminDb.collection('lesson_recovery').add(recoveryDoc);

    console.log(`[RECOVERY] Lesson "${lesson.title}" (${lesson.id}) saved to recovery by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      recoveryId: docRef.id,
      message: 'Lesson saved to recovery successfully',
    });
  } catch (error) {
    return routeErrorResponse(error, 'save lesson to recovery');
  }
}
