import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

const serializeTimestamp = (value: unknown): string | undefined => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return undefined;
};

const serializeWord = (data: Record<string, unknown>) => {
  const serialized: Record<string, unknown> = { ...data };
  if ('createdAt' in serialized) {
    const createdAt = serializeTimestamp(serialized.createdAt);
    if (createdAt) {
      serialized.createdAt = createdAt;
    }
  }
  if ('updatedAt' in serialized) {
    const updatedAt = serializeTimestamp(serialized.updatedAt);
    if (updatedAt) {
      serialized.updatedAt = updatedAt;
    }
  }
  return serialized;
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get('collection') || VOCABULARY_WORDS_COLLECTION;

    const snapshot = await adminDb.collection(collection).get();

    const words = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...serializeWord(data as Record<string, unknown>),
      };
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `vocabulary-backup-${collection}-${timestamp}.json`;

    return new NextResponse(JSON.stringify(words, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
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
