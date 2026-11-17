import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { VocabularyWordSchema } from '@/shared/types/vocabulary/schemas';
import { VocabularyAIReviewSchema } from '@/shared/types/vocabulary/ai-review';
import { adminDb } from '@/src/services/firebase-admin';
import { RequestError } from '@/src/lib/domain-error';
import { cleanForFirestore, requestCollection, serializeRequestSnapshot } from '../utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const { id } = await params;
    const body = await request.json();
    const draftWordResult = VocabularyWordSchema.safeParse(body?.draftWord);

    if (!draftWordResult.success) {
      const errorMessage = draftWordResult.error.issues
        .map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ');
      return NextResponse.json({ success: false, error: `Invalid draft word: ${errorMessage}` }, { status: 400 });
    }

    const docRef = requestCollection().doc(id);
    await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists) throw new RequestError(404, 'VOCABULARY_REQUEST_NOT_FOUND', 'Request not found');
      const draftWord = { ...draftWordResult.data };
      const previousReview = snapshot.data()?.draftWord?.ai_review;
      if (draftWord.ai_review === undefined && previousReview !== undefined) {
        const review = VocabularyAIReviewSchema.safeParse(previousReview);
        if (!review.success) {
          throw new RequestError(409, 'INVALID_STORED_AI_REVIEW', 'The saved AI review is invalid');
        }
        draftWord.ai_review = review.data;
      }
      transaction.update(
        docRef,
        cleanForFirestore({
          draftWord,
          updatedAt: new Date(),
        }) as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>
      );
    });

    const updated = await docRef.get();
    return NextResponse.json({
      success: true,
      data: { request: serializeRequestSnapshot(updated) },
    });
  } catch (error) {
    return routeErrorResponse(error, 'update vocabulary word request');
  }
}
