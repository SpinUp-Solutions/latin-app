import { NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { LessonWithProgress } from '@/src/types/lesson';

export async function GET() {
  try {
    const snapshot = await adminDb.collection('lessons').where('isLive', '==', true).orderBy('liveOrder', 'asc').get();

    if (snapshot.empty) {
      return NextResponse.json({ lessons: [] });
    }

    const lessons: LessonWithProgress[] = snapshot.docs.map(doc => {
      const data = doc.data();
      const progress = 0;
      const status = 'available';

      return {
        id: doc.id,
        title: data.title,
        description: data.description,
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
