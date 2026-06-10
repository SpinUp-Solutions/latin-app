import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';
import { verifyAdminAccess } from '../../../../../../lib/verifyAdminAccess';
import { getLessonContentCounts } from '@/src/utils/lessonSummary';

interface RouteParams {
  params: {
    id: string;
  };
}

// POST - Retry save from recovery (creates or updates the lesson)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recoveryId = params.id;

    // Get recovery item
    const recoveryDoc = await adminDb.collection('lesson_recovery').doc(recoveryId).get();
    if (!recoveryDoc.exists) {
      return NextResponse.json({ error: 'Recovery item not found' }, { status: 404 });
    }

    const recoveryData = recoveryDoc.data();
    if (!recoveryData) {
      return NextResponse.json({ error: 'Recovery data is empty' }, { status: 404 });
    }

    // Verify ownership
    if (recoveryData.userId !== user.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const lesson = recoveryData.rawLessonData as Lesson;

    // Check if lesson already exists
    const existingLessonDoc = await adminDb.collection('lessons').doc(lesson.id).get();
    const lessonExists = existingLessonDoc.exists;

    const { totalPages, totalItems, totalExercises } = getLessonContentCounts(lesson);

    let lessonData;
    if (lessonExists) {
      // Update existing lesson
      const existingLesson = existingLessonDoc.data();
      lessonData = {
        ...lesson,
        totalPages,
        totalItems,
        totalExercises,
        createdAt: existingLesson?.createdAt || new Date().toISOString(),
        createdBy: existingLesson?.createdBy || user.uid,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        version: (existingLesson?.version || 0) + 1,
        isLive: existingLesson?.isLive ?? false,
        liveOrder: existingLesson?.liveOrder ?? null,
        publishedAt: existingLesson?.publishedAt || null,
        publishedBy: existingLesson?.publishedBy || null,
      };
      console.log(`[RECOVERY] Updating existing lesson "${lesson.title}" (${lesson.id}) from recovery`);
    } else {
      // Create new lesson
      lessonData = {
        ...lesson,
        totalPages,
        totalItems,
        totalExercises,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        version: 1,
        isLive: false,
        liveOrder: null,
        publishedAt: null,
        publishedBy: null,
      };
      console.log(`[RECOVERY] Creating new lesson "${lesson.title}" (${lesson.id}) from recovery`);
    }

    // Save lesson to Firestore
    await adminDb.collection('lessons').doc(lesson.id).set(lessonData);

    // Mark recovery item as recovered
    await adminDb.collection('lesson_recovery').doc(recoveryId).update({
      status: 'recovered',
      recoveredAt: new Date().toISOString(),
    });

    console.log(`[RECOVERY] Successfully recovered lesson "${lesson.title}" (${lesson.id}) by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      lesson: lessonData,
      message: lessonExists ? 'Lesson updated successfully from recovery' : 'Lesson created successfully from recovery',
    });
  } catch (error) {
    console.error('Error retrying from recovery:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Failed to retry from recovery' }, { status: 500 });
  }
}

// DELETE - Remove/discard recovery item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recoveryId = params.id;

    // Get recovery item to verify ownership
    const recoveryDoc = await adminDb.collection('lesson_recovery').doc(recoveryId).get();
    if (!recoveryDoc.exists) {
      return NextResponse.json({ error: 'Recovery item not found' }, { status: 404 });
    }

    const recoveryData = recoveryDoc.data();
    if (recoveryData?.userId !== user.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Mark as discarded instead of deleting (for audit trail)
    await adminDb.collection('lesson_recovery').doc(recoveryId).update({
      status: 'discarded',
      discardedAt: new Date().toISOString(),
    });

    console.log(`[RECOVERY] Recovery item ${recoveryId} discarded by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: 'Recovery item discarded',
    });
  } catch (error) {
    console.error('Error deleting recovery item:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Failed to delete recovery item' }, { status: 500 });
  }
}
