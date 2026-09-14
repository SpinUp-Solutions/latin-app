import {
  createVocabularyPoolResolver,
  MAX_LINKED_POOL_GRAPH_SIZE,
} from '@/src/lib/vocabulary-pools/linked-pools.server';
import { VocabularyPoolStateError } from '@/src/lib/vocabulary-pools/pool-state.server';
import { VOCABULARY_POOL_COLLECTION } from '@/shared/constants/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { Query } from 'firebase-admin/firestore';
import type { VocabularyPool, VocabularyPoolSummary, CreatePoolRequest } from '@/src/types/vocabulary-pool';
import {
  buildPoolSearchTokens,
  normalizePoolSearchText,
  toVocabularyPoolSummary,
} from '@/src/utils/vocabularyPoolSummary';
import { AdminAccessError, verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import {
  prepareVocabularyPoolWordMembership,
  VocabularyPoolWordMembershipError,
} from '@/src/lib/vocabulary-pools/word-membership.server';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { isVocabularyPoolCreationPending } from '@/src/lib/vocabulary-pools/archive.server';

export const dynamic = 'force-dynamic';

const POOL_SUMMARY_FIELDS = [
  'name',
  'description',
  'metadata',
  '_creationPending',
  '_deletionPending',
  'sourcePoolIds',
];

const toDateValue = (value: unknown) =>
  value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : value;

const serializePoolSummary = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) => {
  const data = doc.data() as Partial<VocabularyPool>;

  const rawData = doc.data();
  if (isVocabularyPoolCreationPending(rawData) || rawData?._deletionPending) return null;

  return toVocabularyPoolSummary(doc.id, {
    ...data,
    metadata: data.metadata
      ? {
          ...data.metadata,
          createdAt: toDateValue(data.metadata.createdAt),
          updatedAt: toDateValue(data.metadata.updatedAt),
        }
      : undefined,
  });
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20') || 20));
    const resolver = createVocabularyPoolResolver(adminDb);
    const summarize = async (doc: FirebaseFirestore.DocumentSnapshot) => {
      const summary = serializePoolSummary(doc);
      if (summary && doc.data()?.sourcePoolIds !== undefined) {
        const effective = await resolver.resolve(doc.id);
        summary.metadata = { ...summary.metadata, wordCount: effective.metadata.wordCount };
      }
      return summary;
    };
    const lastPoolId = searchParams.get('lastPoolId');
    const search = searchParams.get('search');
    const difficulty = searchParams.get('difficulty');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);
    const isActiveParam = searchParams.get('isActive');
    const isActive = isActiveParam ? isActiveParam === 'true' : null;
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    const sortFieldMap: Record<string, string> = {
      name: 'name',
      wordCount: 'metadata.wordCount',
      createdAt: 'metadata.createdAt',
    };
    const firestoreSortField = sortFieldMap[sortBy] || 'metadata.createdAt';

    if (search) {
      const searchToken = normalizePoolSearchText(search).slice(0, 40);
      let query: Query = adminDb
        .collection(VOCABULARY_POOL_COLLECTION)
        .where('searchTokens', 'array-contains', searchToken)
        .orderBy('name')
        .select(...POOL_SUMMARY_FIELDS);

      if (isActive !== null) {
        query = query.where('metadata.isActive', '==', isActive);
      }
      if (difficulty) {
        query = query.where('metadata.difficulty', '==', difficulty);
      }
      if (lastPoolId) {
        const lastDoc = await adminDb.collection(VOCABULARY_POOL_COLLECTION).doc(lastPoolId).get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }

      const snapshot = await query.limit(limit).get();
      const pools = (await Promise.all(snapshot.docs.map(summarize))).filter(Boolean) as VocabularyPoolSummary[];
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];

      return NextResponse.json({
        success: true,
        data: {
          pools,
          hasMore: snapshot.docs.length === limit,
          lastPoolId: lastDoc?.id || null,
        },
      });
    }

    // Effective counts cannot be ordered by the persisted direct-word count.
    if (sortBy === 'wordCount') {
      const snapshot = await adminDb
        .collection(VOCABULARY_POOL_COLLECTION)
        .limit(MAX_LINKED_POOL_GRAPH_SIZE + 1)
        .select(...POOL_SUMMARY_FIELDS)
        .get();
      if (snapshot.docs.length > MAX_LINKED_POOL_GRAPH_SIZE)
        throw new VocabularyPoolStateError(
          'Too many pools to sort by live word count.',
          'VOCABULARY_POOL_GRAPH_TOO_LARGE'
        );
      const pools: VocabularyPoolSummary[] = [];
      for (const doc of snapshot.docs) {
        const pool = await summarize(doc);
        if (
          !pool ||
          (difficulty && pool.metadata.difficulty !== difficulty) ||
          (isActive !== null && pool.metadata.isActive !== isActive) ||
          (tags?.length && !pool.metadata.tags.some(tag => tags.includes(tag)))
        )
          continue;
        pools.push(pool);
      }
      pools.sort(
        (a, b) =>
          (sortOrder === 'asc' ? 1 : -1) *
          (a.metadata.wordCount - b.metadata.wordCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      );
      const start = lastPoolId ? pools.findIndex(pool => pool.id === lastPoolId) + 1 : 0;
      if (lastPoolId && start === 0)
        return NextResponse.json(
          { success: false, error: 'Pool list changed. Refresh the list.', code: 'VOCABULARY_POOL_CURSOR_STALE' },
          { status: 409 }
        );
      const page = pools.slice(start, start + limit);
      return NextResponse.json({
        success: true,
        data: { pools: page, hasMore: start + limit < pools.length, lastPoolId: page.at(-1)?.id ?? null },
      });
    }

    const useFirestoreFilters = sortBy === 'createdAt';
    let query: Query = adminDb.collection(VOCABULARY_POOL_COLLECTION).orderBy(firestoreSortField, sortOrder);

    if (useFirestoreFilters) {
      if (difficulty) {
        query = query.where('metadata.difficulty', '==', difficulty);
      }
      if (isActive !== null) {
        query = query.where('metadata.isActive', '==', isActive);
      }
      if (tags && tags.length > 0) {
        query = query.where('metadata.tags', 'array-contains-any', tags);
      }
    }

    if (lastPoolId) {
      const lastDoc = await adminDb.collection(VOCABULARY_POOL_COLLECTION).doc(lastPoolId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const fetchLimit = useFirestoreFilters ? limit : limit * 3;
    query = query.limit(fetchLimit).select(...POOL_SUMMARY_FIELDS);
    const snapshot = await query.get();

    let pools = (await Promise.all(snapshot.docs.map(summarize))).filter(Boolean) as VocabularyPoolSummary[];

    if (!useFirestoreFilters) {
      if (difficulty) {
        pools = pools.filter(p => p.metadata.difficulty === difficulty);
      }
      if (isActive !== null) {
        pools = pools.filter(p => p.metadata.isActive === isActive);
      }
      if (tags && tags.length > 0) {
        pools = pools.filter(p => p.metadata.tags.some(t => tags.includes(t)));
      }
    }

    const visibleOverflow = pools.length > limit;
    const hasMore = useFirestoreFilters
      ? snapshot.docs.length === limit
      : snapshot.docs.length === fetchLimit || visibleOverflow;
    pools = pools.slice(0, limit);
    // If filtering removed records from a scanned page, advance from the last
    // scanned document. Once enough visible records were returned, keep the
    // cursor at the last visible record so no filtered records are skipped.
    const lastDoc = visibleOverflow
      ? snapshot.docs.find(d => d.id === pools[pools.length - 1]?.id)
      : snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        pools,
        hasMore,
        lastPoolId: lastDoc?.id || null,
      },
    });
  } catch (error) {
    if (error instanceof VocabularyPoolStateError)
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error fetching vocabulary pools:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const actor = await verifyAdminAccess(request);
    const requestBody = await request.json();
    console.log('[CREATE POOL] Received request body:', JSON.stringify(requestBody, null, 2));

    const { name, description, wordDocIds = [], difficulty, tags = [] }: CreatePoolRequest = requestBody;

    console.log('[CREATE POOL] Parsed fields:', {
      name,
      description: description?.substring(0, 50) + '...',
      wordDocIdsCount: wordDocIds.length,
      difficulty,
      tagsCount: tags.length,
    });

    if (!name?.trim() || !description?.trim()) {
      console.error('[CREATE POOL] Validation failed: Missing name or description');
      return NextResponse.json({ success: false, error: 'Name and description are required' }, { status: 400 });
    }

    if (name.length > 100) {
      console.error('[CREATE POOL] Validation failed: Name too long', { length: name.length });
      return NextResponse.json({ success: false, error: 'Name must be less than 100 characters' }, { status: 400 });
    }

    if (description.length > 500) {
      console.error('[CREATE POOL] Validation failed: Description too long', { length: description.length });
      return NextResponse.json(
        { success: false, error: 'Description must be less than 500 characters' },
        { status: 400 }
      );
    }

    const now = new Date();
    const poolData = {
      name: name.trim(),
      description: description.trim(),
      wordDocIds,
      searchTokens: buildPoolSearchTokens(name),
      metadata: {
        createdAt: now,
        createdBy: actor.uid,
        updatedAt: now,
        updatedBy: actor.uid,
        wordCount: wordDocIds.length,
        isActive: true,
        tags: tags.map(tag => tag.toLowerCase().trim()).filter(Boolean),
        difficulty: difficulty || 'beginner',
      },
    };

    console.log('[CREATE POOL] Attempting to write to Firestore:', {
      name: poolData.name,
      wordCount: poolData.metadata.wordCount,
      difficulty: poolData.metadata.difficulty,
      tagsCount: poolData.metadata.tags.length,
    });

    const docRef = adminDb.collection(VOCABULARY_POOL_COLLECTION).doc();
    await runVocabularyContentMutation(adminDb, async transaction => {
      const applyWordReferenceRevisions = await prepareVocabularyPoolWordMembership(
        transaction,
        adminDb,
        [],
        wordDocIds
      );
      applyWordReferenceRevisions();
      transaction.create(docRef, poolData);
    });

    console.log(`[CREATE POOL] ✓ Successfully created pool "${name}" with ID: ${docRef.id}`);

    return NextResponse.json({
      success: true,
      data: {
        pool: {
          id: docRef.id,
          ...poolData,
        },
      },
    });
  } catch (error) {
    if (error instanceof VocabularyPoolStateError)
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    if (error instanceof AdminAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof VocabularyPoolWordMembershipError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[CREATE POOL] ✗ Error creating vocabulary pool:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: error?.constructor?.name,
    });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
