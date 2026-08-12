import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { auth } from 'firebase-admin';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 20;

const stripMacrons = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0304]/g, '')
    .normalize('NFC');

const verifyAuth = async (request: NextRequest) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    return await auth().verifyIdToken(token);
  } catch {
    return null;
  }
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() ?? '';
    if (!search) {
      return NextResponse.json({ success: true, data: { words: [] } });
    }

    const limitParam = Number.parseInt(searchParams.get('limit') ?? '12', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : 12;
    const searchKey = stripMacrons(search).toLowerCase();

    const snapshot = await adminDb
      .collection(VOCABULARY_WORDS_COLLECTION)
      .orderBy('sort_key')
      .where('sort_key', '>=', searchKey)
      .where('sort_key', '<=', `${searchKey}\uf8ff`)
      .limit(limit)
      .select(
        'word',
        'translation',
        'pronunciation',
        'part_of_speech',
        'definitions',
        'etymology',
        'gender',
        'declension',
        'conjugation',
        'dictionary_entry',
        'principal_parts',
        'dictionary_forms',
        'pronoun_type',
        'person',
        'is_deponent'
      )
      .get();

    const words = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        word: typeof data.word === 'string' ? data.word : '',
        translation: typeof data.translation === 'string' ? data.translation : '',
        part_of_speech: typeof data.part_of_speech === 'string' ? data.part_of_speech : '',
        dictionary_entry: typeof data.dictionary_entry === 'string' ? data.dictionary_entry : null,
      };
    });

    return NextResponse.json({ success: true, data: { words } });
  } catch (error) {
    console.error('Error searching vocabulary:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
