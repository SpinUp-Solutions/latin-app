import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { saveTestAttemptAnswerInputSchema } from '@/src/lib/tests/schemas';
import { testService } from '@/src/lib/tests/service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const attemptId = firestoreDocumentIdSchema.parse((await params).attemptId);
    const input = saveTestAttemptAnswerInputSchema.parse(await request.json().catch(() => null));
    const attempt = await testService.saveAttemptAnswer(attemptId, input, student.uid);
    return NextResponse.json({ attempt });
  } catch (error) {
    return testRouteErrorResponse(error, 'save test attempt answer');
  }
}
