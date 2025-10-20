import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query } from 'firebase-admin/firestore';
import { VocabularyWordSchema } from '@/src/types/vocabulary/schemas';
import { parseFormPathFromString } from '@/src/utils/exerciseFormPaths';
import type { VerbFormPath, NounFormPath, AdjectiveFormPath } from '@/src/types/api/exercise-word-responses';

const DEFAULT_COLLECTION = 'vocabulary_words_v4';
const TABLE_FIELDS = ['word', 'conjugation_table', 'declension_table', 'degrees_table'] as const;

const serializeTimestamp = (value: unknown): string | undefined => {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return undefined;
};

const serializeWord = (data: Record<string, unknown>): Record<string, unknown> => {
  const serialized = { ...data };
  const createdAt = serializeTimestamp(serialized.createdAt);
  const updatedAt = serializeTimestamp(serialized.updatedAt);
  if (createdAt) serialized.createdAt = createdAt;
  if (updatedAt) serialized.updatedAt = updatedAt;
  return serialized;
};

const parseCellPaths = (cellPaths: string | null): string[] => {
  if (!cellPaths) return [];
  return cellPaths
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);
};

const parseSelectFields = (selectFields: string | null): string[] => {
  if (!selectFields) return [];
  return selectFields
    .split(',')
    .map(f => f.trim())
    .filter(f => f.length > 0);
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const wordType = searchParams.get('wordType');
    const limit = parseInt(searchParams.get('limit') || '20');
    const lastWordId = searchParams.get('lastWordId');
    const search = searchParams.get('search');
    const countsOnly = searchParams.get('countsOnly') === 'true';
    const collection = searchParams.get('collection') || DEFAULT_COLLECTION;
    const verbConjugation = searchParams.get('verbConjugation');
    const isDeponent = searchParams.get('isDeponent');
    const nounDeclension = searchParams.get('nounDeclension');
    const adjectiveDeclension = searchParams.get('adjectiveDeclension');
    const cellPaths = searchParams.get('cellPaths');
    const tableType = searchParams.get('tableType');
    const selectFields = searchParams.get('select');
    const randomize = searchParams.get('randomize') === 'true';

    if (countsOnly) {
      const wordTypeCounts = await getWordTypeCounts(collection);
      return NextResponse.json({
        success: true,
        data: {
          wordTypeCounts,
        },
      });
    }

    let query: Query = adminDb.collection(collection);

    const fields = parseSelectFields(selectFields);
    if (fields.length > 0) {
      query = query.select(...fields);
    }

    query = query.orderBy('word');

    if (wordType) {
      query = query.where('part_of_speech', '==', wordType);
    }

    if (search) {
      query = query.where('word', '>=', search).where('word', '<=', search + '\uf8ff');
    }

    if (wordType === 'verb') {
      if (verbConjugation) {
        query = query.where('conjugation', '==', verbConjugation);
      }
      if (isDeponent === 'true') {
        query = query.where('is_deponent', '==', true);
      } else if (isDeponent === 'false') {
        query = query.where('is_deponent', '==', false);
      }
    } else if (wordType === 'noun' && nounDeclension) {
      query = query.where('declension', '==', nounDeclension);
    } else if (wordType === 'adjective' && adjectiveDeclension) {
      query = query.where('declension', '==', adjectiveDeclension);
    }

    if (lastWordId) {
      const lastDocSnapshot = await adminDb.collection(collection).doc(lastWordId).get();
      if (lastDocSnapshot.exists) {
        query = query.startAfter(lastDocSnapshot);
      }
    }

    const fetchLimit = randomize ? Math.min(limit * 10, 200) : limit;
    query = query.limit(fetchLimit);

    const snapshot = await query.get();

    let docs = snapshot.docs;
    if (randomize && docs.length > limit) {
      const shuffled = [...docs].sort(() => Math.random() - 0.5);
      docs = shuffled.slice(0, limit);
    }

    const words = docs.map(doc => {
      const data = doc.data();
      const serialized = serializeWord(data as Record<string, unknown>);
      const isExerciseMode = !!tableType;

      if (isExerciseMode) {
        let selectedForm = serialized.word as string;
        let formPath: VerbFormPath | NounFormPath | AdjectiveFormPath | null = null;

        const paths = parseCellPaths(cellPaths);
        if (paths.length > 0 && tableType) {
          const formResult = pickRandomFormServer(
            serialized,
            tableType as 'conjugation' | 'declension' | 'adjective-declension',
            paths
          );
          if (formResult) {
            selectedForm = formResult.form;
            formPath = parseFormPathFromString(
              formResult.path,
              tableType as 'conjugation' | 'declension' | 'adjective-declension'
            );
          }
        }

        const result = {
          ...serialized,
          id: doc.id,
          root_word: serialized.word,
          selected_form: selectedForm,
          form_path: formPath,
        } as Record<string, unknown>;

        for (const field of TABLE_FIELDS) {
          delete result[field];
        }

        return result;
      } else {
        return {
          id: doc.id,
          ...serialized,
        };
      }
    });

    const hasMore = randomize ? false : snapshot.docs.length === fetchLimit;
    const lastDoc = randomize ? null : docs[docs.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        words,
        hasMore,
        lastWordId: lastDoc?.id || null,
        limit,
        filters: { wordType, search },
        collection,
      },
    });
  } catch (error) {
    console.error('Error fetching words:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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

    const { collection: providedCollection, ...wordPayload } = body as Record<string, unknown> & {
      collection?: string;
      id?: string;
    };

    const collection =
      typeof providedCollection === 'string' && providedCollection.trim() !== ''
        ? providedCollection
        : DEFAULT_COLLECTION;

    const now = new Date();
    const isoTimestamp = now.toISOString();

    const validationResult = VocabularyWordSchema.safeParse({
      ...wordPayload,
      createdAt: isoTimestamp,
      updatedAt: isoTimestamp,
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

    const { createdAt, updatedAt, ...validatedWord } = validationResult.data;
    void createdAt;
    void updatedAt;

    const firestorePayload = {
      ...validatedWord,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb.collection(collection).add(firestorePayload);
    const createdSnapshot = await docRef.get();
    const createdWord = {
      id: createdSnapshot.id,
      ...serializeWord(createdSnapshot.data() as Record<string, unknown>),
    };

    return NextResponse.json({
      success: true,
      data: {
        word: createdWord,
      },
    });
  } catch (error) {
    console.error('Error creating word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { wordId, updates, collection = DEFAULT_COLLECTION } = body;

    if (!wordId || !updates) {
      return NextResponse.json(
        {
          success: false,
          error: 'wordId and updates are required',
        },
        { status: 400 }
      );
    }

    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    await adminDb.collection(collection).doc(wordId).update(updateData);

    const updatedDoc = await adminDb.collection(collection).doc(wordId).get();
    const updatedData = {
      id: updatedDoc.id,
      ...serializeWord(updatedDoc.data() as Record<string, unknown>),
    };

    return NextResponse.json({
      success: true,
      message: 'Word updated successfully',
      updatedData,
    });
  } catch (error) {
    console.error('Error updating word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

const ROOT_FIELD_MAP: Record<string, string> = {
  conjugation: 'conjugation_table',
  declension: 'declension_table',
  'adjective-declension': 'degrees_table',
} as const;

function getCellValueAtPathServer(obj: Record<string, unknown>, path: string): string[] {
  const keys = path.split('.');
  let value: unknown = obj;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return [];
    }
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    const filtered = value.filter((v): v is string => v !== null && v !== undefined && typeof v === 'string');
    return filtered;
  }
  return [];
}

function pickRandomFormServer(
  word: Record<string, unknown>,
  tableType: 'conjugation' | 'declension' | 'adjective-declension',
  selectedPaths: string[]
): { form: string; path: string } | null {
  const rootField = ROOT_FIELD_MAP[tableType];
  if (!rootField) {
    return null;
  }

  const formsWithPaths: Array<{ form: string; path: string }> = [];

  for (const path of selectedPaths) {
    const fullPath = `${rootField}.${path}`;
    const forms = getCellValueAtPathServer(word, fullPath);

    for (const form of forms) {
      formsWithPaths.push({ form, path });
    }
  }

  if (formsWithPaths.length === 0) {
    return null;
  }

  const selected = formsWithPaths[Math.floor(Math.random() * formsWithPaths.length)];
  return selected;
}

async function getWordTypeCounts(collection: string) {
  try {
    const snapshot = await adminDb.collection(collection).limit(1000).get();

    const counts = {
      noun: 0,
      verb: 0,
      adjective: 0,
      adverb: 0,
      preposition: 0,
      pronoun: 0,
      conjunction: 0,
      interjection: 0,
      other: 0,
    };

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const partOfSpeech = data.part_of_speech as string;
      if (counts.hasOwnProperty(partOfSpeech)) {
        counts[partOfSpeech as keyof typeof counts]++;
      } else {
        counts.other++;
      }
    });

    const sampleSize = snapshot.docs.length;
    const scaleFactor = sampleSize < 1000 ? 1 : Math.ceil(sampleSize / 1000);

    Object.keys(counts).forEach(key => {
      counts[key as keyof typeof counts] *= scaleFactor;
    });

    return counts;
  } catch (error) {
    console.error('Error getting word type counts:', error);
    return {
      noun: 0,
      verb: 0,
      adjective: 0,
      adverb: 0,
      preposition: 0,
      pronoun: 0,
      conjunction: 0,
      interjection: 0,
      other: 0,
    };
  }
}
