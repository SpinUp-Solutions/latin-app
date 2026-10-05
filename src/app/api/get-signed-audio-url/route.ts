import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/src/services/firebase-admin';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { parseLessonAudioPath } from '@/src/lib/lesson-audio-path.server';
import { routeErrorResponse } from '@/src/lib/route-error-response';

export async function POST(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
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

    const filePath = parseLessonAudioPath(audioPath, bucketName);
    if (!filePath) {
      return new NextResponse(JSON.stringify({ error: 'Invalid audio path format.' }), { status: 400 });
    }

    // Generate a signed URL that expires in 15 minutes.
    const options = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    };

    const [signedUrl] = await adminStorage.bucket(bucketName).file(filePath).getSignedUrl(options);

    return NextResponse.json({ signedUrl });
  } catch (error) {
    return routeErrorResponse(error, 'generate signed audio URL');
  }
}
