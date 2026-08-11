import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import {
  requireVocabularyWordsCollection,
  VocabularyWordCollectionError,
} from '@/src/lib/vocabulary/word-collection.server';
import {
  prepareVocabularyContentRevisionBump,
  VOCABULARY_CONTENT_STATE_COLLECTION,
  VOCABULARY_CONTENT_STATE_ID,
  vocabularyContentRevision,
} from '@/src/lib/vocabulary-pools/content-revision.server';
import {
  createWordDeletionChallenge,
  firestoreVersionFingerprint,
  isWordDeletionChallengeValid,
  VOCABULARY_WORD_DELETION_CHALLENGE_COLLECTION,
  wordDeletionTokenHash,
  wordDeletionChallengeDocumentId,
} from '@/src/lib/vocabulary/word-deletion.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import {
  cleanupVocabularyWordPoolReferences,
  scanVocabularyWordPoolReferences,
  WORD_DELETION_POOL_WARNING_SAMPLE_SIZE,
} from '@/src/lib/vocabulary/word-deletion-cleanup.server';

class WordDeletionConfirmationError extends Error {
  readonly status = 409;
  readonly code = 'WORD_DELETE_CONFIRMATION_STALE';

  constructor(public readonly referencedPools: Array<{ id: string; name: string }>) {
    super("The word's pool assignments changed. Review the latest warning and try again.");
    this.name = 'WordDeletionConfirmationError';
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wordId: string }> }
): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const { wordId } = await params;
    const { searchParams } = new URL(request.url);
    const collection = requireVocabularyWordsCollection(searchParams.get('collection'));
    const requestBody = await request.json().catch(() => ({}));
    const confirmationToken = typeof requestBody.confirmationToken === 'string' ? requestBody.confirmationToken : null;

    if (!wordId) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId is required',
        },
        { status: 400 }
      );
    }

    const wordRef = adminDb.collection(collection).doc(wordId);
    const poolsQuery = adminDb.collection('vocabulary_pools').where('wordDocIds', 'array-contains', wordId);
    const challengeRef = adminDb
      .collection(VOCABULARY_WORD_DELETION_CHALLENGE_COLLECTION)
      .doc(wordDeletionChallengeDocumentId(wordId, actor.uid));
    const contentStateRef = adminDb.collection(VOCABULARY_CONTENT_STATE_COLLECTION).doc(VOCABULARY_CONTENT_STATE_ID);
    const [scannedWord, scannedContentState] = await Promise.all([wordRef.get(), contentStateRef.get()]);
    if (!scannedWord.exists) throw new Error('Word not found');
    const scannedWordFingerprint = firestoreVersionFingerprint(scannedWord.updateTime);
    const scannedContentRevision = vocabularyContentRevision(scannedContentState.data());
    const currentReferences = await scanVocabularyWordPoolReferences(adminDb, wordId);
    const currentPoolIds = currentReferences.map(pool => pool.id);
    const result = await runVocabularyContentMutation(adminDb, async transaction => {
      const [wordDoc, storedChallenge, contentState] = await Promise.all([
        transaction.get(wordRef),
        transaction.get(challengeRef),
        transaction.get(contentStateRef),
      ]);
      if (!wordDoc.exists) throw new Error('Word not found');
      const wordFingerprint = firestoreVersionFingerprint(wordDoc.updateTime);
      if (
        wordFingerprint !== scannedWordFingerprint ||
        vocabularyContentRevision(contentState.data()) !== scannedContentRevision
      ) {
        throw new WordDeletionConfirmationError(currentReferences);
      }
      const pending = wordDoc.data()?._deletionPending;
      const pendingRecord =
        pending && typeof pending === 'object' && !Array.isArray(pending) ? (pending as Record<string, unknown>) : null;
      const suppliedTokenHash = confirmationToken ? wordDeletionTokenHash(confirmationToken) : null;
      const pendingAuthorizationMatches = Boolean(
        suppliedTokenHash && pendingRecord?.actorUid === actor.uid && pendingRecord.tokenHash === suppliedTokenHash
      );
      if (currentReferences.length > 0 && !confirmationToken) {
        const challenge = createWordDeletionChallenge({
          wordId,
          actorUid: actor.uid,
          poolIds: currentPoolIds,
          wordFingerprint,
        });
        transaction.set(challengeRef, challenge.stored);
        return { warning: true as const, referencedPools: currentReferences, token: challenge.token };
      }
      if (
        confirmationToken &&
        !pendingAuthorizationMatches &&
        !isWordDeletionChallengeValid({
          stored: storedChallenge.data(),
          token: confirmationToken,
          wordId,
          actorUid: actor.uid,
          poolIds: currentPoolIds,
          wordFingerprint,
        })
      ) {
        throw new WordDeletionConfirmationError(currentReferences);
      }
      const applyContentRevision = await prepareVocabularyContentRevisionBump(transaction, adminDb);

      if (currentReferences.length === 0 && !confirmationToken) {
        transaction.delete(wordRef);
        if (storedChallenge.exists) transaction.delete(challengeRef);
        applyContentRevision();
        return { warning: false as const, deleted: true as const, tokenHash: null };
      }

      if (!confirmationToken || !suppliedTokenHash) {
        throw new WordDeletionConfirmationError(currentReferences);
      }
      if (!pendingAuthorizationMatches) {
        transaction.update(wordRef, {
          _deletionPending: {
            actorUid: actor.uid,
            tokenHash: suppliedTokenHash,
            startedAt: new Date(),
          },
        });
      }
      applyContentRevision();
      return { warning: false as const, deleted: false as const, tokenHash: suppliedTokenHash };
    });

    if (result.warning) {
      return NextResponse.json(
        {
          success: false,
          warning: true,
          confirmationToken: result.token,
          referencedPools: result.referencedPools.slice(0, WORD_DELETION_POOL_WARNING_SAMPLE_SIZE),
          referencedPoolCount: result.referencedPools.length,
          message: `This word is referenced by ${result.referencedPools.length} vocabulary pool(s). Deleting it will remove it from those pools.`,
        },
        { status: 409 }
      );
    }

    if (result.deleted) {
      return NextResponse.json({ success: true, message: 'Word deleted successfully' });
    }

    const cleanup = await cleanupVocabularyWordPoolReferences(adminDb, {
      wordId,
      actorUid: actor.uid,
      tokenHash: result.tokenHash,
    });
    await runVocabularyContentMutation(adminDb, async transaction => {
      const [wordDoc, remainingPools, storedChallenge] = await Promise.all([
        transaction.get(wordRef),
        transaction.get(poolsQuery.limit(1)),
        transaction.get(challengeRef),
      ]);
      if (!wordDoc.exists) return;
      const pending = wordDoc.data()?._deletionPending;
      const pendingRecord =
        pending && typeof pending === 'object' && !Array.isArray(pending) ? (pending as Record<string, unknown>) : null;
      if (pendingRecord?.actorUid !== actor.uid || pendingRecord.tokenHash !== result.tokenHash) {
        throw new WordDeletionConfirmationError([]);
      }
      if (!remainingPools.empty) throw new Error('Word deletion cleanup is incomplete');
      const applyContentRevision = await prepareVocabularyContentRevisionBump(transaction, adminDb);
      transaction.delete(wordRef);
      if (storedChallenge.exists) transaction.delete(challengeRef);
      applyContentRevision();
    });

    return NextResponse.json({
      success: true,
      message: 'Word deleted and removed from referencing pools',
      cleanedPoolCount: cleanup.cleanedPoolCount,
      ...(cleanup.cleanedPoolNames.length > 0 ? { cleanedPools: cleanup.cleanedPoolNames } : {}),
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json(
        { success: false, error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status }
      );
    }
    if (error instanceof VocabularyWordCollectionError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && error.message === 'Word not found') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof WordDeletionConfirmationError) {
      return NextResponse.json(
        {
          success: false,
          warning: true,
          error: error.message,
          code: error.code,
          referencedPools: error.referencedPools.slice(0, WORD_DELETION_POOL_WARNING_SAMPLE_SIZE),
          referencedPoolCount: error.referencedPools.length,
        },
        { status: error.status }
      );
    }
    console.error('Error deleting word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
