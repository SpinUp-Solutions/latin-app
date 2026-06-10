import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import type { VocabularyPool } from '@/src/types/vocabulary-pool';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { buildPoolSearchTokens } from '@/src/utils/vocabularyPoolSummary';

const BATCH_SIZE = 400;

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    const snapshot = await adminDb.collection('vocabulary_pools').select('name', 'searchTokens').get();

    const updates = snapshot.docs
      .map(doc => {
        const data = doc.data() as Pick<VocabularyPool, 'name' | 'searchTokens'>;
        const searchTokens = buildPoolSearchTokens(data.name || '');
        const currentTokens = data.searchTokens || [];
        const needsUpdate =
          currentTokens.length !== searchTokens.length ||
          currentTokens.some((token, index) => token !== searchTokens[index]);

        return {
          id: doc.id,
          ref: doc.ref,
          searchTokens,
          needsUpdate,
        };
      })
      .filter(item => item.needsUpdate);

    if (!dryRun) {
      for (let index = 0; index < updates.length; index += BATCH_SIZE) {
        const batch = adminDb.batch();
        for (const update of updates.slice(index, index + BATCH_SIZE)) {
          batch.update(update.ref, { searchTokens: update.searchTokens });
        }
        await batch.commit();
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        dryRun,
        scannedPools: snapshot.docs.length,
        poolsToUpdate: updates.length,
        updatedPools: dryRun ? 0 : updates.length,
        sample: updates.slice(0, 10).map(({ id, searchTokens }) => ({ id, tokenCount: searchTokens.length })),
        requestedBy: user.uid,
      },
    });
  } catch (error) {
    console.error('Error backfilling vocabulary pool search tokens:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
