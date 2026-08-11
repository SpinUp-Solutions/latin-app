import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import { Bucket } from '@google-cloud/storage';
import { verifyAdminAccess } from '../../../../lib/verifyAdminAccess';
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
    return new NextResponse(JSON.stringify({ error: 'An unexpected error occurred' }), { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const lessonId = formData.get('lessonId') as string | null;
    const contentItemId = formData.get('contentItemId') as string | null;

    if (!file || !lessonId || !contentItemId) {
      return new NextResponse(JSON.stringify({ error: 'Missing required form data' }), { status: 400 });
    }

    const fileExtension = file.name.split('.').pop();
    const destination = `lessons/${lessonId}/content_audio/${contentItemId}.${fileExtension}`;

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
    console.error('Error uploading file:', error);
    if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Request blocked',
          ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
        },
        { status: error.status }
      );
    }
    return new NextResponse(JSON.stringify({ error: 'Failed to upload file' }), { status: 500 });
  }
}
