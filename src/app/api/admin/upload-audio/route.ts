import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import { Bucket } from '@google-cloud/storage';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { runVocabularyContentStorageMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { isLessonAudioObjectPath } from '@/src/lib/lesson-audio-path.server';

export async function POST(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const lessonId = formData.get('lessonId') as string | null;
    const contentItemId = formData.get('contentItemId') as string | null;

    if (!file || !lessonId || !contentItemId) {
      return new NextResponse(JSON.stringify({ error: 'Missing required form data' }), { status: 400 });
    }

    const fileExtension = file.name.split('.').pop();
    const destination = `lessons/${lessonId}/content_audio/${contentItemId}.${fileExtension}`;
    // Store only paths the audio signer and deleter accept, or the file could never be played or removed.
    if (!isLessonAudioObjectPath(destination)) {
      return new NextResponse(JSON.stringify({ error: 'Invalid lesson, content item or file name' }), { status: 400 });
    }

    const bucket = adminStorage.bucket() as unknown as Bucket;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    await runVocabularyContentStorageMutation(adminDb, () =>
      bucket.file(destination).save(fileBuffer, {
        metadata: {
          contentType: file.type,
        },
      })
    );

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

    return new NextResponse(JSON.stringify({ audioPath: publicUrl }), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error, 'upload audio file');
  }
}
