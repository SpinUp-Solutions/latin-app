import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { requestCollection, routeError, serializeRequestSnapshot } from '../../utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    await verifyAdminAccess(request);
    const body = await request.json().catch(() => ({}));
    const dismissedReason = typeof body?.reason === 'string' ? body.reason : null;
    const docRef = requestCollection().doc(params.id);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    await docRef.update({
      status: 'dismissed',
      dismissedReason,
      updatedAt: new Date(),
    });

    const updated = await docRef.get();
    return NextResponse.json({
      success: true,
      data: { request: serializeRequestSnapshot(updated) },
    });
  } catch (error) {
    return routeError(error);
  }
}
