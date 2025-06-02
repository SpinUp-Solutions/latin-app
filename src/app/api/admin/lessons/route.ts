import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';

async function verifyAdminAccess(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Check if user has admin role
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    if (!userData || userData.role !== 'admin') {
      return null;
    }

    return decodedToken;
  } catch (error) {
    console.error('Error verifying admin access:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const lessonsSnapshot = await adminDb.collection('lessons').orderBy('createdAt', 'desc').get();
    const lessons = lessonsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error('Error fetching lessons:', error);
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
      published: false,
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
      published: existingLesson?.published || false,
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
    return NextResponse.json({ error: 'Failed to update lesson' }, { status: 500 });
  }
}
