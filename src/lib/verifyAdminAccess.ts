import { NextRequest } from 'next/server';
import { adminDb, adminAuth } from '@/src/services/firebase-admin';

export async function verifyAdminAccess(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.split('Bearer ')[1];
  const decodedToken = await adminAuth.verifyIdToken(token);

  const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  if (userData?.role !== 'admin') {
    throw new Error('Forbidden');
  }

  return decodedToken;
}
