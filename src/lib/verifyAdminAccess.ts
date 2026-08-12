import { NextRequest } from 'next/server';
import { adminDb, adminAuth } from '@/src/services/firebase-admin';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import { CONTENT_SYNC_LOCK_COLLECTION, CONTENT_SYNC_LOCK_ID } from '@/src/lib/vocabulary-pools/sync-lock.server';

export { AdminAccessError } from '@/src/lib/admin-access-error';

export async function verifyAuthenticatedAccess(request: NextRequest) {
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

  return decodedToken;
}

export async function verifyAdminAccess(request: NextRequest) {
  const decodedToken = await verifyAuthenticatedAccess(request);

  const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  if (userData?.role !== 'admin') {
    throw new AdminAccessError('Forbidden', 403);
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
    const syncLock = await adminDb.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID).get();
    if (syncLock.exists) {
      throw new AdminAccessError(
        'Production content maintenance is in progress. Try again when it finishes.',
        409,
        'VOCABULARY_CONTENT_SYNC_IN_PROGRESS'
      );
    }
  }

  return decodedToken;
}
