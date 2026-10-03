import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import type { Query } from 'firebase-admin/firestore';
import { VocabularyWordSchema } from '@/shared/types/vocabulary/schemas';
import { serializeVocabularyWord } from '@/src/lib/vocabulary/word-serialization.server';
import { stripMacrons } from '@/src/utils/exercises/helpers';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { prepareVocabularyContentRevisionBump } from '@/src/lib/vocabulary-pools/content-revision.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

const COUNTED_PARTS_OF_SPEECH = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'pronoun',
  'conjunction',
  'interjection',
] as const;

const parseCsv = (value: string | null): string[] =>
  value
    ? value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
    : [];

const applyMultiValueFilter = (query: Query, field: string, paramValue: string | null): Query => {
  const values = parseCsv(paramValue);
  if (values.length === 0) return query;
  return values.length === 1 ? query.where(field, '==', values[0]) : query.where(field, 'in', values);
};

function errorResponse(error: unknown, action: string): NextResponse {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error(`Error ${action}:`, error);
  return NextResponse.json(
    { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' },
    { status: 500 }
  );
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { searchParams } = new URL(request.url);

    if (searchParams.get('countsOnly') === 'true') {
      return NextResponse.json({ success: true, data: { wordTypeCounts: await getWordTypeCounts() } });
    }

    const wordType = searchParams.get('wordType');
    const limit = parseInt(searchParams.get('limit') || '20');
    const lastWordId = searchParams.get('lastWordId');
    // A prefix match on "amo " would find nothing, and every caller means "amo".
    const search = searchParams.get('search')?.trim() || null;
    const selectValues = parseCsv(searchParams.get('select'));
    const words = adminDb.collection(VOCABULARY_WORDS_COLLECTION);

    let query: Query = selectValues.length > 0 ? words.select(...selectValues) : words;
    query = query.orderBy('sort_key');
    if (wordType) query = query.where('part_of_speech', '==', wordType);
    if (search) {
      const searchKey = stripMacrons(search);
      query = query.where('sort_key', '>=', searchKey).where('sort_key', '<=', searchKey + '\uf8ff');
    }
    if (wordType === 'verb') {
      query = applyMultiValueFilter(query, 'conjugation', searchParams.get('verbConjugation'));
      const isDeponent = searchParams.get('isDeponent');
      if (isDeponent === 'true' || isDeponent === 'false') {
        query = query.where('is_deponent', '==', isDeponent === 'true');
      }
    } else if (wordType === 'noun') {
      query = applyMultiValueFilter(query, 'declension', searchParams.get('nounDeclension'));
    } else if (wordType === 'adjective') {
      query = applyMultiValueFilter(query, 'declension', searchParams.get('adjectiveDeclension'));
    } else if (wordType === 'pronoun') {
      query = applyMultiValueFilter(query, 'pronoun_type', searchParams.get('pronounType'));
      query = applyMultiValueFilter(query, 'person', searchParams.get('pronounPerson'));
    }

    if (lastWordId) {
      const lastDocSnapshot = await words.doc(lastWordId).get();
      if (lastDocSnapshot.exists) {
        query = query.startAfter(lastDocSnapshot);
      }
    }

    const { docs } = await query.limit(limit).get();

    return NextResponse.json({
      success: true,
      data: {
        words: docs.map(doc => ({ id: doc.id, ...serializeVocabularyWord(doc.data()) })),
        hasMore: docs.length === limit,
        lastWordId: docs[docs.length - 1]?.id ?? null,
        limit,
        filters: { wordType, search },
      },
    });
  } catch (error) {
    return errorResponse(error, 'fetching words');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
        },
        { status: 400 }
      );
    }

    // Older clients still send the collection name; the server alone decides where words live.
    const { collection: _ignoredCollection, ...wordPayload } = body as Record<string, unknown>;

    const now = new Date();
    const validationResult = VocabularyWordSchema.safeParse({
      ...wordPayload,
      sort_key: stripMacrons(typeof wordPayload.word === 'string' ? wordPayload.word : ''),
      random_index: Math.random(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues
        .map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');
      return NextResponse.json(
        {
          success: false,
          error: `Invalid word data: ${errorMessage}`,
        },
        { status: 400 }
      );
    }

    const firestorePayload = { ...validationResult.data, createdAt: now, updatedAt: now };

    const docRef = adminDb.collection(VOCABULARY_WORDS_COLLECTION).doc();
    await runVocabularyContentMutation(adminDb, async transaction => {
      const applyContentRevision = await prepareVocabularyContentRevisionBump(transaction, adminDb);
      applyContentRevision();
      transaction.create(docRef, firestorePayload);
    });
    const createdSnapshot = await docRef.get();
    const createdWord = {
      id: createdSnapshot.id,
      ...serializeVocabularyWord(createdSnapshot.data() as Record<string, unknown>),
    };

    return NextResponse.json({
      success: true,
      data: {
        word: createdWord,
      },
    });
  } catch (error) {
    return errorResponse(error, 'creating word');
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const body = await request.json();
    const { wordId, updates } = body;

    if (!wordId || !updates) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId and updates are required',
        },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (typeof updates.word === 'string') {
      updateData.sort_key = stripMacrons(updates.word);
    }

    const existingRef = adminDb.collection(VOCABULARY_WORDS_COLLECTION).doc(wordId);
    const updateResult = await runVocabularyContentMutation(adminDb, async transaction => {
      const existingSnapshot = await transaction.get(existingRef);
      if (!existingSnapshot.exists) return { status: 'not-found' as const };
      if (existingSnapshot.data()?._deletionPending) return { status: 'deleting' as const };

      const existingSerialized = serializeVocabularyWord(existingSnapshot.data() as Record<string, unknown>);
      const validationCandidate: Record<string, unknown> = {
        ...existingSerialized,
        ...updates,
        ...(typeof updateData.sort_key === 'string' ? { sort_key: updateData.sort_key } : {}),
        updatedAt: new Date().toISOString(),
      };
      const validationResult = VocabularyWordSchema.safeParse(validationCandidate);
      if (!validationResult.success) {
        return { status: 'invalid' as const, issues: validationResult.error.issues };
      }

      const applyContentRevision = await prepareVocabularyContentRevisionBump(transaction, adminDb);
      transaction.update(existingRef, updateData as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
      applyContentRevision();
      return {
        status: 'updated' as const,
        data: { id: existingSnapshot.id, ...serializeVocabularyWord({ ...existingSnapshot.data(), ...updateData }) },
      };
    });

    if (updateResult.status === 'not-found') {
      return NextResponse.json({ success: false, error: 'Word not found' }, { status: 404 });
    }
    if (updateResult.status === 'deleting') {
      return NextResponse.json(
        { success: false, error: 'Word deletion is already in progress', code: 'WORD_DELETE_IN_PROGRESS' },
        { status: 409 }
      );
    }
    if (updateResult.status === 'invalid') {
      const errorMessage = updateResult.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return NextResponse.json({ success: false, error: `Invalid word data: ${errorMessage}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Word updated successfully',
      updatedData: updateResult.data,
    });
  } catch (error) {
    return errorResponse(error, 'updating word');
  }
}

async function getWordTypeCounts() {
  const counts: Record<string, number> = Object.fromEntries(
    [...COUNTED_PARTS_OF_SPEECH, 'other'].map(partOfSpeech => [partOfSpeech, 0])
  );

  try {
    const results = await Promise.all(
      COUNTED_PARTS_OF_SPEECH.map(async partOfSpeech => {
        const snapshot = await adminDb
          .collection(VOCABULARY_WORDS_COLLECTION)
          .where('part_of_speech', '==', partOfSpeech)
          .count()
          .get();
        return [partOfSpeech, snapshot.data().count] as const;
      })
    );
    for (const [partOfSpeech, count] of results) {
      counts[partOfSpeech] = count;
    }
  } catch (error) {
    console.error('Error getting word type counts:', error);
  }
  return counts;
}
