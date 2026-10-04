import { VOCABULARY_POOL_COLLECTION } from '@/shared/constants/firestore';
import { resolveVocabularyPool } from '@/src/lib/vocabulary-pools/linked-pools.server';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { VocabularyPool } from '@/src/types/vocabulary-pool';
import { toVocabularyPoolSummary } from '@/src/utils/vocabularyPoolSummary';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { isVocabularyPoolCreationPending } from '@/src/lib/vocabulary-pools/pool-state.server';
import { routeErrorResponse } from '@/src/lib/route-error-response';

export const dynamic = 'force-dynamic';

const toDateValue = (value: unknown) =>
  value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : value;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { poolId } = await params;

    const snapshot = await adminDb
      .collection(VOCABULARY_POOL_COLLECTION)
      .where(FieldPath.documentId(), '==', poolId)
      .select('name', 'description', 'metadata', '_creationPending', 'sourcePoolIds', 'wordDocIds')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }

    const poolDoc = snapshot.docs[0];
    if (isVocabularyPoolCreationPending(poolDoc.data())) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }
    const data = (await resolveVocabularyPool(adminDb, poolId, poolDoc.data())) as Partial<VocabularyPool>;
    const {
      _copyRequest: _privateCopyRequest,
      _creationPending: _pendingCreation,
      ...publicData
    } = data as Record<string, unknown>;
    const pool = toVocabularyPoolSummary(poolDoc.id, {
      ...(publicData as Partial<VocabularyPool>),
      metadata: data.metadata
        ? {
            ...data.metadata,
            createdAt: toDateValue(data.metadata.createdAt),
            updatedAt: toDateValue(data.metadata.updatedAt),
          }
        : undefined,
    });

    return NextResponse.json({
      success: true,
      data: { pool },
    });
  } catch (error) {
    return routeErrorResponse(error, 'fetch vocabulary pool summary');
  }
}
