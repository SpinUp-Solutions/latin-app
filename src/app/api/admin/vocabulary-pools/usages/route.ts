import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
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
    console.error('Error fetching vocabulary pool usages:', error);
    const status = error instanceof AdminAccessError ? error.status : 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch vocabulary pool usages' },
      { status }
    );
  }
}
