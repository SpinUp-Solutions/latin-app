import { NextRequest, NextResponse } from 'next/server';
import { createVocabularyPoolFromPoolsRequestSchema } from '@/shared/types/vocabulary/pool-requests';
import {
  createVocabularyPoolFromPools,
  VocabularyPoolFromPoolsError,
} from '@/src/lib/vocabulary-pools/from-pools.server';
import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { adminDb } from '@/src/services/firebase-admin';

export const dynamic = 'force-dynamic';

const routeErrorResponse = createRouteErrorResponse(VocabularyPoolFromPoolsError);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate before parsing or reading any protected pool/word data.
    const actor = await verifyAdminAccess(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }
    const input = createVocabularyPoolFromPoolsRequestSchema.parse(body);
    const { _copyRequest: _privateRequest, ...pool } = await createVocabularyPoolFromPools(adminDb, actor.uid, input);

    return NextResponse.json(
      {
        success: true,
        data: { pool },
      },
      { status: 201 }
    );
  } catch (error) {
    return routeErrorResponse(error, 'create vocabulary pool from pools');
  }
}
