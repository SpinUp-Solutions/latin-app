import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { scanVocabularyPoolUsages } from '@/src/lib/vocabulary-pools/usage.server';
import type { VocabularyPoolUsage } from '@/src/types/vocabulary-pool';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const result = await scanVocabularyPoolUsages(adminDb);
    if (result.status === 'unavailable') {
      return NextResponse.json({
        success: true,
        data: { status: 'unavailable', usagesByPoolId: {}, message: result.message },
      });
    }

    const usagesByPoolId = result.usages.reduce<Record<string, VocabularyPoolUsage[]>>((byPoolId, usage) => {
      (byPoolId[usage.poolId] ??= []).push(usage);
      return byPoolId;
    }, {});
    return NextResponse.json({ success: true, data: { status: 'available', usagesByPoolId } });
  } catch (error) {
    return routeErrorResponse(error, 'fetch vocabulary pool usages');
  }
}
