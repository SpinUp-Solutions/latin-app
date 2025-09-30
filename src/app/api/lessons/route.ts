import { NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { LessonWithProgress } from '@/src/types/lesson';

export async function GET() {
  try {
    const snapshot = await adminDb.collection('lessons')
      .where('isLive', '==', true)
      .orderBy('liveOrder', 'asc')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ lessons: [] });
    }

    const lessons: LessonWithProgress[] = snapshot.docs.map(doc => {
      const data = doc.data();
      const progress = 0;
      const status = progress === 0 ? 'available' : progress === 100 ? 'completed' : 'in-progress';

      return {
        id: doc.id,
        ...data,
        progress,
        status,
      } as LessonWithProgress;
    });

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error('Error fetching live lessons:', error);
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}