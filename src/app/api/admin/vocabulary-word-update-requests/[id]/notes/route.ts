import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { addWordUpdateNote, listWordUpdateNotes } from '@/src/lib/vocabulary/word-update-requests.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { id } = await params;
    return NextResponse.json(await listWordUpdateNotes(adminDb, actor.uid, id));
  } catch (error) {
    return routeErrorResponse(error, 'fetch vocabulary word update notes');
  }
}

/** Adds the admin's note, such as why they think the word is wrong. */
export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { id } = await params;
    return NextResponse.json(await addWordUpdateNote(adminDb, actor.uid, id, await request.json().catch(() => null)), {
      status: 201,
    });
  } catch (error) {
    return routeErrorResponse(error, 'add vocabulary word update note');
  }
}
