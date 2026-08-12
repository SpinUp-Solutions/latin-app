import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import {
  buildValidatedWordForApproval,
  requestCollection,
  routeError,
  serializeRequestSnapshot,
  wordCollection,
} from '../../utils';
import { adminDb } from '@/src/services/firebase-admin';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

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
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    const requestData = snapshot.data() || {};
    if (requestData.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Only pending requests can be approved' }, { status: 409 });
    }

    const validated = buildValidatedWordForApproval(requestData.draftWord);
    if (!validated.success) {
      return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
    }

    const wordRef = wordCollection().doc();
    await runVocabularyContentMutation(adminDb, async transaction => {
      const currentRequest = await transaction.get(docRef);
      if (!currentRequest.exists || currentRequest.data()?.status !== 'pending') {
        throw new Error('Only a currently pending request can be approved');
      }
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
    return routeError(error);
  }
}
