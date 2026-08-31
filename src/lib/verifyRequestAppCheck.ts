import { getAppCheck } from 'firebase-admin/app-check';
import type { NextRequest } from 'next/server';
import { adminApp } from '@/src/services/firebase-admin';

export async function verifyRequestAppCheck(request: NextRequest): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') return true;
  const token = request.headers.get('X-Firebase-AppCheck');
  if (!token) return false;
  try {
    await getAppCheck(adminApp).verifyToken(token);
    return true;
  } catch {
    return false;
  }
}
