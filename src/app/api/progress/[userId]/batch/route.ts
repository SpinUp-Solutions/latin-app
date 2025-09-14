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

export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const currentUser = await verifyAuth(request);

    if (currentUser.uid !== params.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progressCollection = adminDb.collection('userProgress');
    const userProgressDocs = await progressCollection.where('userId', '==', params.userId).get();

    const progressMap: Record<string, unknown> = {};

    userProgressDocs.docs.forEach(doc => {
      const data = doc.data();
      const lessonId = data.lessonId || doc.id.split('_')[1];

      if (lessonId) {
        progressMap[lessonId] = {
          ...data,
          userId: params.userId,
          lessonId,
        };
      }
    });

    return NextResponse.json(progressMap);
  } catch (error) {
    console.error('Error fetching batch progress:', error);
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
  }
}
