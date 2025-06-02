import { NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';

export async function GET() {
  try {
    await adminDb.collection('_test').doc('connection').get();

    return NextResponse.json({
      success: true,
      message: 'Admin SDK connected successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin SDK test failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Admin SDK connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
