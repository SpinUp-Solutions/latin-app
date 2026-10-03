import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { serializeVocabularyWord } from '@/src/lib/vocabulary/word-serialization.server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const snapshot = await adminDb.collection(VOCABULARY_WORDS_COLLECTION).get();

    const words = snapshot.docs.map(doc => ({ id: doc.id, ...serializeVocabularyWord(doc.data()) }));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `vocabulary-backup-${VOCABULARY_WORDS_COLLECTION}-${timestamp}.json`;

    return new NextResponse(JSON.stringify(words, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error creating backup:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
