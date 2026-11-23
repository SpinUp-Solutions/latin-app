import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { pendingRequestData, requestCollection, serializeRequestSnapshot } from '../../utils';
import { adminDb } from '@/src/services/firebase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const body = await request.json().catch(() => ({}));
    const dismissedReason = typeof body?.reason === 'string' ? body.reason : null;
    const { id } = await params;
    const docRef = requestCollection().doc(id);
    await adminDb.runTransaction(async tx => {
      pendingRequestData(await tx.get(docRef));
      tx.update(docRef, { status: 'dismissed', dismissedReason, updatedAt: new Date() });
    });

    const updated = await docRef.get();
    return NextResponse.json({
      success: true,
      data: { request: serializeRequestSnapshot(updated) },
    });
  } catch (error) {
    return routeErrorResponse(error, 'dismiss vocabulary word request');
  }
}
