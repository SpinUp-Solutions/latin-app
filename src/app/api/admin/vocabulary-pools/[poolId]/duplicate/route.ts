import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { VOCABULARY_POOL_COLLECTION } from '@/src/lib/vocabulary-pools/archive.server';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { buildPoolSearchTokens } from '@/src/utils/vocabularyPoolSummary';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import {
  runVocabularyContentExclusiveMutation,
  runVocabularyContentMutation,
  VocabularyContentSyncLockError,
} from '@/src/lib/vocabulary-pools/sync-lock.server';
import type { VocabularyPool } from '@/src/types/vocabulary-pool';

export const dynamic = 'force-dynamic';

const WORD_UPDATE_BATCH_SIZE = 200;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { poolId } = await params;
    const body = (await request.json().catch(() => ({}))) as { name?: string };

    const sourcePoolRef = adminDb.collection(VOCABULARY_POOL_COLLECTION).doc(poolId);
    const newPoolRef = adminDb.collection(VOCABULARY_POOL_COLLECTION).doc();

    const result = await runVocabularyContentExclusiveMutation(adminDb, async lockOwnerId => {
      const sourceSnapshot = await sourcePoolRef.get();
      if (!sourceSnapshot.exists) {
        throw new Error('Pool not found');
      }

      const sourceData = sourceSnapshot.data() as Partial<VocabularyPool>;
      const rawWordIds = Array.isArray(sourceData.wordDocIds) ? sourceData.wordDocIds : [];
      const uniqueWordIds = [...new Set(rawWordIds)].filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0
      );

      const wordRefs = uniqueWordIds.map(id => adminDb.collection(VOCABULARY_WORDS_COLLECTION).doc(id));
      const wordSnapshots: FirebaseFirestore.DocumentSnapshot[] = [];

      for (let i = 0; i < wordRefs.length; i += WORD_UPDATE_BATCH_SIZE) {
        const batchRefs = wordRefs.slice(i, i + WORD_UPDATE_BATCH_SIZE);
        const batchSnapshots = await adminDb.getAll(...batchRefs);
        wordSnapshots.push(...batchSnapshots);
      }

      const validWordIds = new Set<string>();
      const validWordUpdates: Array<{ ref: FirebaseFirestore.DocumentReference; nextRevision: number }> = [];

      uniqueWordIds.forEach((id, index) => {
        const snap = wordSnapshots[index];
        if (snap?.exists && !snap.data()?._deletionPending) {
          validWordIds.add(id);
          const currentRevision = snap.data()?._poolReferenceRevision;
          validWordUpdates.push({
            ref: wordRefs[index],
            nextRevision: Number.isSafeInteger(currentRevision) ? Number(currentRevision) + 1 : 1,
          });
        }
      });

      const orderedWordIds = rawWordIds.filter(id => validWordIds.has(id));

      for (let i = 0; i < validWordUpdates.length; i += WORD_UPDATE_BATCH_SIZE) {
        const chunk = validWordUpdates.slice(i, i + WORD_UPDATE_BATCH_SIZE);
        await runVocabularyContentMutation(
          adminDb,
          async transaction => {
            for (const update of chunk) {
              transaction.update(update.ref, {
                _poolReferenceRevision: update.nextRevision,
              });
            }
          },
          { lockOwnerId }
        );
      }

      const requestedName = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;
      const baseName = (sourceData.name || 'Untitled Pool').trim();
      const defaultName = baseName.length > 93 ? `${baseName.slice(0, 93)} (Copy)` : `${baseName} (Copy)`;
      const targetName = (requestedName || defaultName).slice(0, 100);

      const now = new Date();
      const newPoolData = {
        name: targetName,
        description: sourceData.description || '',
        wordDocIds: orderedWordIds,
        searchTokens: buildPoolSearchTokens(targetName),
        metadata: {
          createdAt: now,
          createdBy: actor.uid,
          updatedAt: now,
          updatedBy: actor.uid,
          wordCount: orderedWordIds.length,
          isActive: false,
          tags: Array.isArray(sourceData.metadata?.tags)
            ? sourceData.metadata.tags.map(tag => String(tag).toLowerCase().trim()).filter(Boolean)
            : [],
          difficulty: sourceData.metadata?.difficulty || 'beginner',
        },
      };

      await runVocabularyContentMutation(
        adminDb,
        async transaction => {
          transaction.create(newPoolRef, newPoolData);
        },
        { lockOwnerId }
      );

      return {
        id: newPoolRef.id,
        ...newPoolData,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          pool: result,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof VocabularyContentSyncLockError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error('Error duplicating vocabulary pool:', error);
    const notFound = error instanceof Error && error.message.includes('not found');
    const status = notFound ? 404 : 500;
    return NextResponse.json(
      { success: false, error: notFound ? error.message : 'Failed to duplicate vocabulary pool' },
      { status }
    );
  }
}
