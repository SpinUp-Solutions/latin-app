import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { runVocabularyContentStorageMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

export async function POST(req: NextRequest) {
  try {
    await verifyAdminAccess(req);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Request blocked' },
        { status: error.status }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      } else if (error.message === 'Forbidden') {
        return new NextResponse(JSON.stringify({ error: 'Forbidden: User is not an admin' }), { status: 403 });
      }
    }
    return new NextResponse(JSON.stringify({ error: 'An unexpected error occurred during authorization' }), {
      status: 500,
    });
  }

  try {
    const { audioPath } = await req.json();

    if (!audioPath) {
      return new NextResponse(JSON.stringify({ error: 'Audio path is required' }), { status: 400 });
    }

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
      throw new Error('Firebase Storage bucket name is not configured.');
    }
    const prefix = `https://storage.googleapis.com/${bucketName}/`;

    if (!audioPath.startsWith(prefix)) {
      return new NextResponse(JSON.stringify({ error: 'Invalid audio path format' }), { status: 400 });
    }

    const filePath = decodeURIComponent(audioPath.substring(prefix.length));

    await runVocabularyContentStorageMutation(adminDb, () => adminStorage.bucket(bucketName).file(filePath).delete());

    return NextResponse.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file from Firebase Storage:', error);
    if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Request blocked',
          ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
        },
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to delete file';
    return new NextResponse(JSON.stringify({ error: message }), { status: 500 });
  }
}
