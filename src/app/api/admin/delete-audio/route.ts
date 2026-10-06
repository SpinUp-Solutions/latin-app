import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { runVocabularyContentStorageMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { parseLessonAudioPath } from '@/src/lib/lesson-audio-path.server';

export async function POST(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    const { audioPath } = await request.json();

    if (!audioPath) {
      return new NextResponse(JSON.stringify({ error: 'Audio path is required' }), { status: 400 });
    }

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
      throw new Error('Firebase Storage bucket name is not configured.');
    }
    const filePath = parseLessonAudioPath(audioPath, bucketName);
    if (!filePath) {
      return new NextResponse(JSON.stringify({ error: 'Invalid audio path format' }), { status: 400 });
    }

    await runVocabularyContentStorageMutation(adminDb, () => adminStorage.bucket(bucketName).file(filePath).delete());

    return NextResponse.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    return routeErrorResponse(error, 'delete audio file');
  }
}
