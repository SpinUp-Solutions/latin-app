import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import {
  LEGACY_VOCABULARY_WORDS_COLLECTION,
  requireVocabularyWordMigrationCollections,
  VocabularyWordCollectionError,
} from '@/src/lib/vocabulary/word-collection.server';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { prepareVocabularyContentRevisionBump } from '@/src/lib/vocabulary-pools/content-revision.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

const DEFAULT_SOURCE_COLLECTION = LEGACY_VOCABULARY_WORDS_COLLECTION;
const DEFAULT_TARGET_COLLECTION = VOCABULARY_WORDS_COLLECTION;

const stripMacrons = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0304]/g, '')
    .normalize('NFC');
};

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    const { sourceCollection, targetCollection } = requireVocabularyWordMigrationCollections(
      searchParams.get('sourceCollection') || DEFAULT_SOURCE_COLLECTION,
      searchParams.get('targetCollection') || DEFAULT_TARGET_COLLECTION
    );

    const snapshot = await adminDb.collection(sourceCollection).get();

    const migratedWords = [];
    const errors = [];
    const BATCH_SIZE = 400;

    const docsToMigrate = [];

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        const word = typeof data.word === 'string' ? data.word : '';
        const sortKey = stripMacrons(word);
        const randomIndex = Math.random();

        const migratedData = {
          ...data,
          sort_key: sortKey,
          random_index: randomIndex,
          dictionary_entry: null,
        };

        migratedWords.push({
          id: doc.id,
          word: word,
          part_of_speech: data.part_of_speech,
          sort_key: sortKey,
          random_index: randomIndex,
          dictionary_entry: null,
        });

        docsToMigrate.push({
          id: doc.id,
          data: migratedData,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          docId: doc.id,
          word: doc.data().word || 'unknown',
          error: errorMessage,
        });
      }
    }

    if (!dryRun) {
      for (let i = 0; i < docsToMigrate.length; i += BATCH_SIZE) {
        const chunk = docsToMigrate.slice(i, i + BATCH_SIZE);
        await runVocabularyContentMutation(adminDb, async transaction => {
          const targetRefs = chunk.map(docToMigrate => adminDb.collection(targetCollection).doc(docToMigrate.id));
          const existingTargets = targetRefs.length > 0 ? await transaction.getAll(...targetRefs) : [];
          if (existingTargets.some(target => Boolean(target.data()?._deletionPending))) {
            throw new AdminAccessError(
              'A vocabulary word deletion is in progress. Retry the migration after it finishes.',
              409,
              'WORD_DELETE_IN_PROGRESS'
            );
          }
          const applyContentRevision = await prepareVocabularyContentRevisionBump(transaction, adminDb);
          chunk.forEach((docToMigrate, index) => transaction.set(targetRefs[index], docToMigrate.data));
          applyContentRevision();
        });
      }
    }

    const summary = {
      dryRun,
      sourceCollection,
      targetCollection,
      totalDocuments: snapshot.docs.length,
      successfulMigrations: migratedWords.length,
      errors: errors.length,
      batchCount: Math.ceil(docsToMigrate.length / BATCH_SIZE),
      errorDetails: errors,
      sampleMigrations: migratedWords.slice(0, 10),
    };

    return NextResponse.json({
      success: true,
      message: dryRun
        ? `Dry run complete: ${migratedWords.length} words ready to migrate`
        : `Successfully migrated ${migratedWords.length} words to ${targetCollection} in ${summary.batchCount} batches`,
      data: summary,
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof VocabularyWordCollectionError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Error during migration:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
