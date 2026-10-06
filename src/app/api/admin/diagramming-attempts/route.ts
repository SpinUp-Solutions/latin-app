import { NextRequest, NextResponse } from 'next/server';
import { Query } from 'firebase-admin/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';

export const dynamic = 'force-dynamic';

type AttemptDocument = Record<string, unknown> & {
  createdAt?: { toMillis?: () => number };
};

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    const { searchParams } = request.nextUrl;
    const lessonId = searchParams.get('lessonId');
    const exerciseId = searchParams.get('exerciseId');
    const date = searchParams.get('date');

    let query: Query = adminDb.collection('diagramming_attempts');
    if (lessonId) query = query.where('lessonId', '==', lessonId);
    if (exerciseId) query = query.where('exerciseId', '==', exerciseId);
    if (date) query = query.where('date', '==', date);

    const snapshot = await query.limit(250).get();
    const attempts: AttemptDocument[] = snapshot.docs
      .map<AttemptDocument>(doc => ({ id: doc.id, ...doc.data() }))
      .sort((left, right) => {
        const leftTime = left.createdAt?.toMillis?.() || 0;
        const rightTime = right.createdAt?.toMillis?.() || 0;
        return rightTime - leftTime;
      });

    return NextResponse.json({ attempts });
  } catch (error) {
    return routeErrorResponse(error, 'load diagramming attempts');
  }
}
