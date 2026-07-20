import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import type { Lesson } from '@/src/types/lesson';
import { validateLessonProgression } from '@/src/utils/lessonProgress';

interface UpdateRequest {
  lessonIds: string[];
  isLive: boolean;
  startOrder?: number;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lessonIds, isLive, startOrder }: UpdateRequest = await request.json();

    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      return NextResponse.json({ error: 'lessonIds array required' }, { status: 400 });
    }

    const batch = adminDb.batch();
    let processedCount = 0;
    let nextOrder = startOrder;

    // Get current max order if publishing and no startOrder provided
    if (isLive && nextOrder === undefined) {
      const maxOrderSnapshot = await adminDb
        .collection('lessons')
        .where('isLive', '==', true)
        .orderBy('liveOrder', 'desc')
        .get();
      const maxOrderDoc = maxOrderSnapshot.docs.find(doc => isLessonDocumentData(doc.data()));

      nextOrder = maxOrderDoc ? maxOrderDoc.data().liveOrder + 1 : 0;
    }

    for (const lessonId of lessonIds) {
      const lessonRef = adminDb.collection('lessons').doc(lessonId);
      const lessonDoc = await lessonRef.get();

      if (!lessonDoc.exists) continue;

      const currentData = lessonDoc.data();
      if (!isLessonDocumentData(currentData)) continue;
      const lessonData = currentData as Partial<Lesson>;
      if (lessonData.isLive === isLive) continue; // Already in desired state

      if (isLive) {
        const progressionErrors = validateLessonProgression({ pages: lessonData.pages || [] });
        if (progressionErrors.length > 0) {
          return NextResponse.json({ error: `Cannot publish lesson ${lessonId}`, progressionErrors }, { status: 400 });
        }
      }

      const updateData: Record<string, string | number | boolean | null> = {
        isLive,
        publishedBy: user.uid,
        updatedAt: new Date().toISOString(),
      };

      if (isLive && nextOrder !== undefined) {
        updateData.liveOrder = nextOrder++;
        updateData.publishedAt = new Date().toISOString();
      } else {
        updateData.liveOrder = null;
        updateData.publishedAt = null;
      }

      batch.update(lessonRef, updateData);
      processedCount++;
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `${isLive ? 'Published' : 'Unpublished'} ${processedCount} lessons`,
      processedCount,
    });
  } catch (error) {
    console.error('Error updating lesson publish status:', error);
    return NextResponse.json({ error: 'Failed to update lessons' }, { status: 500 });
  }
}
