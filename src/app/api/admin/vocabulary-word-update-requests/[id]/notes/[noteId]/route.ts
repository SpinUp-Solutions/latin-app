import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { deleteWordUpdateNote } from '@/src/lib/vocabulary/word-update-requests.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Deletes one of the admin's own notes. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { id, noteId } = await params;
    return NextResponse.json(await deleteWordUpdateNote(adminDb, actor.uid, id, noteId));
  } catch (error) {
    return routeErrorResponse(error, 'delete vocabulary word update note');
  }
}
