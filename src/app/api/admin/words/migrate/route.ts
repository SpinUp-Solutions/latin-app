import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';

const DEFAULT_SOURCE_COLLECTION = 'vocabulary_words_v4';
const DEFAULT_TARGET_COLLECTION = 'vocabulary_words_v5';

const stripMacrons = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0304]/g, '').normalize('NFC');
};

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    const sourceCollection = searchParams.get('sourceCollection') || DEFAULT_SOURCE_COLLECTION;
    const targetCollection = searchParams.get('targetCollection') || DEFAULT_TARGET_COLLECTION;

    const snapshot = await adminDb.collection(sourceCollection).get();

    const migratedWords = [];
    const errors = [];
    const BATCH_SIZE = 500;

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
      const batches = [];
      for (let i = 0; i < docsToMigrate.length; i += BATCH_SIZE) {
        const chunk = docsToMigrate.slice(i, i + BATCH_SIZE);
        const batch = adminDb.batch();

        for (const docToMigrate of chunk) {
          const docRef = adminDb.collection(targetCollection).doc(docToMigrate.id);
          batch.set(docRef, docToMigrate.data);
        }

        batches.push(batch.commit());
      }

      await Promise.all(batches);
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
