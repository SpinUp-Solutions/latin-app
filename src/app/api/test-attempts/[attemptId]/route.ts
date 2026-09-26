import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testAttemptService } from '@/src/lib/tests/attempt-service';

export async function GET(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const attemptId = firestoreDocumentIdSchema.parse((await params).attemptId);
    return NextResponse.json(
      { attempt: await testAttemptService.getAttempt(attemptId, student.uid) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return testRouteErrorResponse(error, 'read test attempt');
  }
}
