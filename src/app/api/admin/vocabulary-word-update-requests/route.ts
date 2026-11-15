import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { VOCABULARY_WORD_UPDATE_REQUEST_STATUSES } from '@/shared/types/vocabulary/update-requests';
import { listWordUpdateRequests, stageWordUpdate } from '@/src/lib/vocabulary/word-update-requests.server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const StatusSchema = z.enum(VOCABULARY_WORD_UPDATE_REQUEST_STATUSES).default('pending');

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const status = StatusSchema.parse(new URL(request.url).searchParams.get('status') ?? undefined);
    return NextResponse.json(await listWordUpdateRequests(adminDb, status));
  } catch (error) {
    return routeErrorResponse(error, 'fetch vocabulary word update requests');
  }
}

/** Stages a proposed change to an existing word for review. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const result = await stageWordUpdate(adminDb, actor.uid, await request.json().catch(() => null));
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return routeErrorResponse(error, 'stage vocabulary word update');
  }
}
