import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { VocabularyWordSchema } from '@/shared/types/vocabulary/schemas';
import { cleanForFirestore, requestCollection, routeError, serializeRequestSnapshot } from '../utils';

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
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    await docRef.update(
      cleanForFirestore({
        draftWord: draftWordResult.data,
        updatedAt: new Date(),
      }) as Record<string, unknown>
    );

    const updated = await docRef.get();
    return NextResponse.json({
      success: true,
      data: { request: serializeRequestSnapshot(updated) },
    });
  } catch (error) {
    return routeError(error);
  }
}
