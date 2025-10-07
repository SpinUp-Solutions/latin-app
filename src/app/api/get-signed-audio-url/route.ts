import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/src/services/firebase-admin';
import { getAuth } from 'firebase-admin/auth';

export async function POST(req: NextRequest) {
  const authToken = req.headers.get('authorization')?.split('Bearer ')[1];
  if (!authToken) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Verify the user is authenticated
    await getAuth().verifyIdToken(authToken);
  } catch (error) {
    console.error('Error verifying auth token for signed URL:', error);
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

    const prefix = `https://storage.googleapis.com/${bucketName}/`;
    if (!audioPath.startsWith(prefix)) {
      return new NextResponse(JSON.stringify({ error: 'Invalid audio path format.' }), { status: 400 });
    }

    const filePath = decodeURIComponent(audioPath.substring(prefix.length));

    // Generate a signed URL that expires in 15 minutes.
    const options = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    };

    const [signedUrl] = await adminStorage.bucket(bucketName).file(filePath).getSignedUrl(options);

    return NextResponse.json({ signedUrl });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate signed URL.';
    return new NextResponse(JSON.stringify({ error: message }), { status: 500 });
  }
}
