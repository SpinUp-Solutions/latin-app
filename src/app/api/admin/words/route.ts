import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query } from 'firebase-admin/firestore';
import { VocabularyWordSchema } from '@/src/types/vocabulary/schemas';

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
    const wordType = searchParams.get('wordType');
    const limit = parseInt(searchParams.get('limit') || '20');
    const lastWordId = searchParams.get('lastWordId');
    const search = searchParams.get('search');
    const countsOnly = searchParams.get('countsOnly') === 'true';
    const collection = searchParams.get('collection') || 'vocabulary_words_v4';
    const verbConjugation = searchParams.get('verbConjugation');
    const isDeponent = searchParams.get('isDeponent');
    const nounDeclension = searchParams.get('nounDeclension');
    const adjectiveDeclension = searchParams.get('adjectiveDeclension');
    const cellPaths = searchParams.get('cellPaths');
    const tableType = searchParams.get('tableType');
    const selectFields = searchParams.get('select');

    console.log('[API] GET /api/admin/words - Query params:', {
      wordType,
      limit,
      lastWordId,
      search,
      countsOnly,
      collection,
      verbConjugation,
      isDeponent,
      nounDeclension,
      adjectiveDeclension,
      cellPaths,
      tableType,
      selectFields,
    });

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

    if (selectFields) {
      const fields = selectFields.split(',').map(f => f.trim()).filter(f => f.length > 0);
      if (fields.length > 0) {
        query = query.select(...fields);
        console.log('[API] Firestore query - Selected fields:', fields);
      }
    } else {
      console.log('[API] Firestore query - Fetching all fields (no select parameter)');
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

    query = query.limit(limit);

    const snapshot = await query.get();

    console.log('[API] Firestore query executed - Document count:', snapshot.docs.length);

    const words = snapshot.docs.map(doc => {
      const data = doc.data();
      const serialized = serializeWord(data as Record<string, unknown>);

      console.log('[API] Processing document:', doc.id, 'Keys:', Object.keys(serialized));

      const isExerciseMode = !!(cellPaths && tableType);

      if (isExerciseMode) {
        let selectedForm = serialized.word as string;
        let formPath: Record<string, string> | null = null;

        const paths = cellPaths.split(',').map(p => p.trim());
        console.log('[API] Exercise mode - Attempting form selection - paths:', paths, 'tableType:', tableType);

        const formResult = pickRandomFormServer(serialized, tableType, paths);
        if (formResult) {
          selectedForm = formResult.form;
          formPath = parseFormPath(formResult.path, tableType);
          console.log('[API] Form selected successfully:', { selectedForm, formPath });
        } else {
          console.log('[API] Form selection failed, using root word');
        }

        const result = {
          root_word: serialized.word,
          conjugation: serialized.conjugation || null,
          selected_form: selectedForm,
          form_path: formPath,
          definitions: serialized.definitions || [],
        };

        console.log('[API] Final word result (exercise mode):', result);
        return result;
      } else {
        const result = {
          id: doc.id,
          ...serialized,
        };

        console.log('[API] Final word result (normal mode):', result);
        return result;
      }
    });

    const hasMore = snapshot.docs.length === limit;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

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

    const {
      collection: providedCollection,
      id: unusedId,
      ...wordPayload
    } = body as Record<string, unknown> & {
      collection?: string;
      id?: string;
    };
    void unusedId;

    const collection =
      typeof providedCollection === 'string' && providedCollection.trim() !== ''
        ? providedCollection
        : 'vocabulary_words_v4';

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
    const { wordId, updates, collection = 'vocabulary_words_v4' } = body;

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
      updatedData: updatedData,
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

function parseFormPath(
  path: string,
  tableType: string
): Record<string, string> | null {
  if (!path) return null;

  const parts = path.split('.');
  console.log('[API] parseFormPath - Input:', { path, tableType, parts });

  if (tableType === 'conjugation') {
    if (parts.length === 5) {
      const parsed = {
        tense: parts[0],
        voice: parts[1],
        mood: parts[2],
        person: parts[3],
        number: parts[4],
      };
      console.log('[API] parseFormPath - Conjugation parsed:', parsed);
      return parsed;
    }
  } else if (tableType === 'declension') {
    if (parts.length === 2) {
      const parsed = {
        number: parts[0],
        case: parts[1],
      };
      console.log('[API] parseFormPath - Declension parsed:', parsed);
      return parsed;
    }
  } else if (tableType === 'adjective-declension') {
    if (parts.length === 4) {
      const parsed = {
        degree: parts[0],
        gender: parts[1],
        number: parts[2],
        case: parts[3],
      };
      console.log('[API] parseFormPath - Adjective (4 parts) parsed:', parsed);
      return parsed;
    } else if (parts.length === 2) {
      const parsed = {
        number: parts[0],
        case: parts[1],
      };
      console.log('[API] parseFormPath - Adjective (2 parts) parsed:', parsed);
      return parsed;
    }
  }

  console.log('[API] parseFormPath - Could not parse, returning raw object');
  return { raw: path };
}

function getCellValueAtPathServer(obj: Record<string, unknown>, path: string): string[] {
  const keys = path.split('.');
  let value: unknown = obj;

  console.log('[API] getCellValueAtPathServer - Navigating path:', path);

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = (value as Record<string, unknown>)[key];
      console.log('[API] getCellValueAtPathServer - Found key:', key, 'value type:', typeof value);
    } else {
      console.log('[API] getCellValueAtPathServer - Key not found:', key);
      return [];
    }
  }

  if (value === null || value === undefined) {
    console.log('[API] getCellValueAtPathServer - Value is null/undefined');
    return [];
  }

  if (typeof value === 'string') {
    console.log('[API] getCellValueAtPathServer - Found string value:', value);
    return [value];
  }

  if (Array.isArray(value)) {
    const filtered = value.filter((v): v is string => v !== null && v !== undefined && typeof v === 'string');
    console.log('[API] getCellValueAtPathServer - Found array, filtered to:', filtered);
    return filtered;
  }

  console.log('[API] getCellValueAtPathServer - Unexpected value type:', typeof value);
  return [];
}

function pickRandomFormServer(
  word: Record<string, unknown>,
  tableType: string,
  selectedPaths: string[]
): { form: string; path: string } | null {
  console.log('[API] pickRandomFormServer - Input:', { tableType, selectedPaths, wordKeys: Object.keys(word) });

  const rootFieldMap: Record<string, string> = {
    conjugation: 'conjugation_table',
    declension: 'declension_table',
    'adjective-declension': 'degrees_table',
  };

  const rootField = rootFieldMap[tableType];
  if (!rootField) {
    console.log('[API] pickRandomFormServer - No root field found for tableType:', tableType);
    return null;
  }

  console.log('[API] pickRandomFormServer - Using root field:', rootField);

  const formsWithPaths: Array<{ form: string; path: string }> = [];

  for (const path of selectedPaths) {
    const fullPath = `${rootField}.${path}`;
    console.log('[API] pickRandomFormServer - Checking path:', fullPath);
    const forms = getCellValueAtPathServer(word, fullPath);

    for (const form of forms) {
      formsWithPaths.push({ form, path });
      console.log('[API] pickRandomFormServer - Added form:', { form, path });
    }
  }

  console.log('[API] pickRandomFormServer - Total forms collected:', formsWithPaths.length);

  if (formsWithPaths.length === 0) {
    console.log('[API] pickRandomFormServer - No forms found, returning null');
    return null;
  }

  const selected = formsWithPaths[Math.floor(Math.random() * formsWithPaths.length)];
  console.log('[API] pickRandomFormServer - Selected form:', selected);
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
