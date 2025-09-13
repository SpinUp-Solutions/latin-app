import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';
import { verifyAdminAccess } from '../../../../lib/verifyAdminAccess';

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await adminDb.collection('lessons')
      .orderBy('updatedAt', 'desc')
      .get();

    const lessons = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Lesson[];

    const liveLessons = lessons.filter(l => l.isLive);
    const availableLessons = lessons.filter(l => !l.isLive);

    return NextResponse.json({
      lessons,
      liveLessons,
      availableLessons,
    });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lesson: Lesson = await request.json();

    // Validate required fields
    if (!lesson.id || !lesson.title) {
      return NextResponse.json({ error: 'Lesson ID and title are required' }, { status: 400 });
    }

    // Check if lesson ID already exists
    const existingLesson = await adminDb.collection('lessons').doc(lesson.id).get();
    if (existingLesson.exists) {
      return NextResponse.json({ error: 'A lesson with this ID already exists' }, { status: 409 });
    }

    // Add metadata
    const lessonData = {
      ...lesson,
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

    // Save to Firestore
    await adminDb.collection('lessons').doc(lesson.id).set(lessonData);

    console.log(`Lesson "${lesson.title}" (${lesson.id}) created successfully by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      lesson: lessonData,
      message: 'Lesson created successfully',
    });
  } catch (error) {
    console.error('Error creating lesson:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Failed to create lesson' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lesson: Lesson = await request.json();

    // Validate required fields
    if (!lesson.id || !lesson.title) {
      return NextResponse.json({ error: 'Lesson ID and title are required' }, { status: 400 });
    }

    // Check if lesson exists
    const existingLessonDoc = await adminDb.collection('lessons').doc(lesson.id).get();
    if (!existingLessonDoc.exists) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const existingLesson = existingLessonDoc.data();

    const updatedLessonData = {
      ...lesson,
      createdAt: existingLesson?.createdAt || new Date().toISOString(),
      createdBy: existingLesson?.createdBy || user.uid,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
      version: (existingLesson?.version || 0) + 1,
      isLive: existingLesson?.isLive || false,
      liveOrder: existingLesson?.liveOrder || null,
      publishedAt: existingLesson?.publishedAt || null,
      publishedBy: existingLesson?.publishedBy || null,
    };

    await adminDb.collection('lessons').doc(lesson.id).set(updatedLessonData);

    console.log(`Lesson "${lesson.title}" (${lesson.id}) updated successfully by user ${user.uid}`);

    return NextResponse.json({
      success: true,
      lesson: updatedLessonData,
      message: 'Lesson updated successfully',
    });
  } catch (error) {
    console.error('Error updating lesson:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return NextResponse.json({ error: 'Failed to update lesson' }, { status: 500 });
  }
}
