import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { getWordUpdateRequestDetail, saveWordUpdateProposal } from '@/src/lib/vocabulary/word-update-requests.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { id } = await params;
    return NextResponse.json(await getWordUpdateRequestDetail(adminDb, id));
  } catch (error) {
    return routeErrorResponse(error, 'fetch vocabulary word update request');
  }
}

/** Saves the reviewer's edit of the proposed word. */
export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { id } = await params;
    return NextResponse.json(
      await saveWordUpdateProposal(adminDb, actor.uid, id, await request.json().catch(() => null))
    );
  } catch (error) {
    return routeErrorResponse(error, 'save vocabulary word update proposal');
  }
}
