import { getAppCheck } from 'firebase-admin/app-check';
import type { NextRequest } from 'next/server';
import { adminApp } from '@/src/services/firebase-admin';
import { shouldEnforceAIAppCheck } from '@/shared/openai/app-check-policy.server';

export async function verifyRequestAppCheck(request: NextRequest): Promise<boolean> {
  if (!shouldEnforceAIAppCheck()) return true;
  const token = request.headers.get('X-Firebase-AppCheck');
  if (!token) return false;
  try {
    await getAppCheck(adminApp).verifyToken(token);
    return true;
  } catch {
    return false;
  }
}
