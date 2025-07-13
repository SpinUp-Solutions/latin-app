import { NextRequest } from 'next/server';
import { adminDb, adminAuth } from '@/src/services/firebase-admin';

export async function verifyAdminAccess(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.split('Bearer ')[1];
  const decodedToken = await adminAuth.verifyIdToken(token);

  // Check custom claims first
  if (decodedToken.admin === true) {
    return decodedToken;
  }

  // Fallback to checking Firestore for the role
  const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  if (userData?.role === 'admin') {
    return decodedToken;
  }

  throw new Error('Forbidden');
}
