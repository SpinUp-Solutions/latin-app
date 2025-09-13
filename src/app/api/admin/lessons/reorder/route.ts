import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

interface ReorderUpdate {
  lessonId: string;
  liveOrder: number;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { updates }: { updates: ReorderUpdate[] } = await request.json();

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'Updates array required' }, { status: 400 });
    }

    const batch = adminDb.batch();

    for (const { lessonId, liveOrder } of updates) {
      const lessonRef = adminDb.collection('lessons').doc(lessonId);
      batch.update(lessonRef, { liveOrder, updatedAt: new Date().toISOString() });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Updated order for ${updates.length} lessons`,
      updatedCount: updates.length,
    });
  } catch (error) {
    console.error('Error reordering lessons:', error);
    return NextResponse.json({ error: 'Failed to reorder lessons' }, { status: 500 });
  }
}
