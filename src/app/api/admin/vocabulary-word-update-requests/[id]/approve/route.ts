import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { approveWordUpdate } from '@/src/lib/vocabulary/word-update-requests.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Writes the reviewed proposal to the word. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { id } = await params;
    return NextResponse.json(await approveWordUpdate(adminDb, actor.uid, id, await request.json().catch(() => null)));
  } catch (error) {
    return routeErrorResponse(error, 'approve vocabulary word update');
  }
}
