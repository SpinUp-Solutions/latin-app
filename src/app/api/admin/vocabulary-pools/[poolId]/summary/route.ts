import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { VocabularyPool } from '@/src/types/vocabulary-pool';
import { toVocabularyPoolSummary } from '@/src/utils/vocabularyPoolSummary';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

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
      .collection('vocabulary_pools')
      .where(FieldPath.documentId(), '==', poolId)
      .select('name', 'description', 'metadata')
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ success: false, error: 'Pool not found' }, { status: 404 });
    }

    const poolDoc = snapshot.docs[0];
    const data = poolDoc.data() as Partial<VocabularyPool>;
    const pool = toVocabularyPoolSummary(poolDoc.id, {
      ...data,
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
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error fetching vocabulary pool summary:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
