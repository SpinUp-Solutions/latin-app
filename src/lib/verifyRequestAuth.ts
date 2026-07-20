import { NextRequest } from 'next/server';
import { auth } from 'firebase-admin';

export async function verifyRequestAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    return await auth().verifyIdToken(authHeader.substring(7));
  } catch {
    return null;
  }
}
