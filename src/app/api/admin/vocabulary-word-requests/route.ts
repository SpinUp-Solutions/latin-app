import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { VocabularyWordSchema } from '@/shared/types/vocabulary/schemas';
import {
  RootWordCandidate,
  VOCABULARY_WORD_REQUEST_STATUSES,
  VocabularyWordRequestStatus,
} from '@/shared/types/vocabulary/requests';
import { buildDraftVocabularyWord } from '@/src/utils/vocabulary-request-drafts';
import { requestCollection, routeError, serializeRequestSnapshot, cleanForFirestore } from './utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CandidateSchema = z.object({
  word: z.string().min(1),
  part_of_speech: z.enum([
    'noun',
    'verb',
    'adjective',
    'pronoun',
    'adverb',
    'preposition',
    'conjunction',
    'interjection',
  ]),
  dictionary_entry: z.string().nullable().optional(),
  translation_hint: z.string().nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string().nullable().optional(),
});

const statusSet = new Set<string>(VOCABULARY_WORD_REQUEST_STATUSES);

const requestUpdatedAt = (value: { updatedAt?: string; createdAt?: string }): number => {
  const updatedAt = Date.parse(value.updatedAt || '');
  if (!Number.isNaN(updatedAt)) return updatedAt;

  const createdAt = Date.parse(value.createdAt || '');
  return Number.isNaN(createdAt) ? 0 : createdAt;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') || 'pending';
    const status: VocabularyWordRequestStatus = statusSet.has(statusParam)
      ? (statusParam as VocabularyWordRequestStatus)
      : 'pending';

    const snapshot = await requestCollection().where('status', '==', status).limit(100).get();
    const requests = snapshot.docs
      .map(doc => serializeRequestSnapshot(doc))
      .sort((a, b) => requestUpdatedAt(b) - requestUpdatedAt(a));

    return NextResponse.json({ success: true, data: { requests } });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyAdminAccess(request);
    const body = await request.json();
    const sourceText = typeof body?.sourceText === 'string' ? body.sourceText.trim() : '';
    const selectedCandidateResult = CandidateSchema.safeParse(body?.selectedCandidate);
    const candidatesResult = z.array(CandidateSchema).min(1).max(5).safeParse(body?.candidates);

    if (!sourceText) {
      return NextResponse.json({ success: false, error: 'sourceText is required' }, { status: 400 });
    }
    if (!selectedCandidateResult.success || !candidatesResult.success) {
      return NextResponse.json({ success: false, error: 'Invalid root candidate payload' }, { status: 400 });
    }

    const autocompleteData =
      body?.autocompleteData && typeof body.autocompleteData === 'object' ? body.autocompleteData : {};
    const draftWord = buildDraftVocabularyWord(selectedCandidateResult.data as RootWordCandidate, autocompleteData);
    const validationResult = VocabularyWordSchema.safeParse(draftWord);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.issues
        .map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');
      return NextResponse.json({ success: false, error: `Invalid draft word: ${errorMessage}` }, { status: 400 });
    }

    const now = new Date();
    const payload = cleanForFirestore({
      status: 'pending',
      sourceText,
      selectedCandidate: selectedCandidateResult.data,
      candidates: candidatesResult.data,
      draftWord: validationResult.data,
      aiMeta: body?.aiMeta && typeof body.aiMeta === 'object' ? body.aiMeta : undefined,
      createdBy: user.uid,
      createdAt: now,
      updatedAt: now,
      approvedWordId: null,
      dismissedReason: null,
    }) as Record<string, unknown>;

    const docRef = await requestCollection().add(payload);
    const created = await docRef.get();

    return NextResponse.json({ success: true, data: { request: serializeRequestSnapshot(created) } }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
