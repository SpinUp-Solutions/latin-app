import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { RequestError } from '@/src/lib/domain-error';
import {
  buildValidatedWordForApproval,
  pendingRequestData,
  requestCollection,
  serializeRequestSnapshot,
  wordCollection,
} from '../../utils';
import { adminDb } from '@/src/services/firebase-admin';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';
import { assertHeadwordAvailable } from '@/src/lib/vocabulary/duplicate-words.server';
import { prepareVocabularyContentRevisionBump } from '@/src/lib/vocabulary-pools/content-revision.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { id } = await params;
    const docRef = requestCollection().doc(id);
    const { confirmedHeadword } = z
      .object({ confirmedHeadword: z.string().min(1).optional() })
      .parse(request.body ? await request.json().catch(() => null) : {});

    const wordRef = wordCollection().doc();
    await runVocabularyContentMutation(adminDb, async transaction => {
      const current = pendingRequestData(await transaction.get(docRef));
      const validated = buildValidatedWordForApproval(current.draftWord);
      if (!validated.success) throw new RequestError(400, 'INVALID_WORD_DATA', validated.error);
      const { word } = validated.data.validatedWord;
      if (confirmedHeadword !== word) await assertHeadwordAvailable(adminDb, word, transaction);
      const bumpRevision = await prepareVocabularyContentRevisionBump(transaction, adminDb);
      bumpRevision();
      transaction.create(wordRef, validated.data.firestorePayload);
      transaction.update(docRef, {
        status: 'approved',
        approvedWordId: wordRef.id,
        draftWord: validated.data.validatedWord,
        updatedAt: new Date(),
      });
    });

    const updated = await docRef.get();
    return NextResponse.json({
      success: true,
      data: {
        request: serializeRequestSnapshot(updated),
        wordId: wordRef.id,
      },
    });
  } catch (error) {
    return routeErrorResponse(error, 'approve vocabulary word request');
  }
}
