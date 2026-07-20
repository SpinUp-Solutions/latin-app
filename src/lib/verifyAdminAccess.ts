import { NextRequest } from 'next/server';
import { adminDb, adminAuth } from '@/src/services/firebase-admin';

export class AdminAccessError extends Error {
  constructor(
    message: 'Unauthorized' | 'Forbidden',
    public readonly status: 401 | 403
  ) {
    super(message);
    this.name = 'AdminAccessError';
  }
}

export async function verifyAdminAccess(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AdminAccessError('Unauthorized', 401);
  }

  const token = authHeader.split('Bearer ')[1];
  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch {
    throw new AdminAccessError('Unauthorized', 401);
  }

  const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  if (userData?.role !== 'admin') {
    throw new AdminAccessError('Forbidden', 403);
  }

  return decodedToken;
}
