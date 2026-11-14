import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { dismissWordUpdate } from '@/src/lib/vocabulary/word-update-requests.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Closes the request without changing the word. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { id } = await params;
    return NextResponse.json(await dismissWordUpdate(adminDb, actor.uid, id, await request.json().catch(() => null)));
  } catch (error) {
    return routeErrorResponse(error, 'dismiss vocabulary word update');
  }
}
