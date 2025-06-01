import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/src/services/firebase-admin';
import { Lesson } from '@/src/types/lesson';

// Helper function to verify admin role
async function verifyAdminRole(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { isAdmin: false, error: 'No authorization header' };
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Get user document to check role
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    return {
      isAdmin: userData?.role === 'admin',
      userId: decodedToken.uid,
      error: null,
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return { isAdmin: false, error: 'Invalid token' };
  }
}

// GET: Fetch all lessons
export async function GET(request: NextRequest) {
  try {
    const { isAdmin, error } = await verifyAdminRole(request);

    if (!isAdmin) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const lessonsSnapshot = await adminDb.collection('lessons').get();
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

// POST: Create new lesson
export async function POST(request: NextRequest) {
  try {
    const { isAdmin, error } = await verifyAdminRole(request);

    if (!isAdmin) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const lessonData: Lesson = await request.json();

    // Validate lesson data structure
    if (!lessonData.id || !lessonData.title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Save lesson to Firestore
    await adminDb
      .collection('lessons')
      .doc(lessonData.id)
      .set({
        ...lessonData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    return NextResponse.json({
      message: 'Lesson created successfully',
      lessonId: lessonData.id,
    });
  } catch (error) {
    console.error('Error creating lesson:', error);
    return NextResponse.json({ error: 'Failed to create lesson' }, { status: 500 });
  }
}

// PUT: Update existing lesson
export async function PUT(request: NextRequest) {
  try {
    const { isAdmin, error } = await verifyAdminRole(request);

    if (!isAdmin) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const lessonData: Lesson = await request.json();

    if (!lessonData.id) {
      return NextResponse.json({ error: 'Lesson ID is required' }, { status: 400 });
    }

    // Update lesson in Firestore
    await adminDb
      .collection('lessons')
      .doc(lessonData.id)
      .update({
        ...lessonData,
        updatedAt: new Date().toISOString(),
      });

    return NextResponse.json({
      message: 'Lesson updated successfully',
      lessonId: lessonData.id,
    });
  } catch (error) {
    console.error('Error updating lesson:', error);
    return NextResponse.json({ error: 'Failed to update lesson' }, { status: 500 });
  }
}
