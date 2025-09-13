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

export async function POST(request: NextRequest) {
  try {
    const currentUser = await verifyAuth(request);
    const { userId } = await request.json();

    if (currentUser.uid !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progressCollection = adminDb.collection('userProgress');
    const allProgressDocs = await progressCollection.get();
    const userDocs = allProgressDocs.docs.filter(doc =>
      doc.id.startsWith(`${userId}_`) || doc.data().userId === userId
    );

    if (userDocs.length > 0) {
      const batch = adminDb.batch();
      userDocs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      deletedCount: userDocs.length
    });

  } catch (error) {
    console.error('Error resetting progress:', error);
    return NextResponse.json({ error: 'Failed to reset progress' }, { status: 500 });
  }
}