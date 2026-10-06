import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { saveTestAttemptAnswersInputSchema } from '@/src/lib/tests/schemas';
import { testAttemptService } from '@/src/lib/tests/attempt-service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const attemptId = firestoreDocumentIdSchema.parse((await params).attemptId);
    const input = saveTestAttemptAnswersInputSchema.parse(await request.json().catch(() => null));
    const attempt = await testAttemptService.saveAttemptAnswers(attemptId, input, student.uid);
    return NextResponse.json({ attempt });
  } catch (error) {
    return routeErrorResponse(error, 'save test attempt answer');
  }
}
