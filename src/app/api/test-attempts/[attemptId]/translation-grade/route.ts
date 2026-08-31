import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testAttemptService } from '@/src/lib/tests/attempt-service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { verifyRequestAppCheck } from '@/src/lib/verifyRequestAppCheck';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await verifyRequestAppCheck(request))) {
      return NextResponse.json({ error: 'Valid app attestation is required' }, { status: 401 });
    }

    const attemptId = firestoreDocumentIdSchema.parse((await params).attemptId);
    const attempt = await testAttemptService.gradeTranslationItem(
      attemptId,
      await request.json().catch(() => null),
      student.uid
    );
    return NextResponse.json({ attempt });
  } catch (error) {
    return testRouteErrorResponse(error, 'grade test translation');
  }
}
