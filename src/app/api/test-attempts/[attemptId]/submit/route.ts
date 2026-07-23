import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testService } from '@/src/lib/tests/service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const attemptId = firestoreDocumentIdSchema.parse((await params).attemptId);
    const result = await testService.submitAttempt(attemptId, student.uid);
    return NextResponse.json(result);
  } catch (error) {
    return testRouteErrorResponse(error, 'submit test attempt');
  }
}
