import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testAttemptService } from '@/src/lib/tests/attempt-service';
import { gradeTestTranslationInputSchema } from '@/src/lib/tests/schemas';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const attemptId = firestoreDocumentIdSchema.parse((await params).attemptId);
    const input = gradeTestTranslationInputSchema.parse(await request.json().catch(() => null));
    const result = await testAttemptService.gradeTranslationItem(attemptId, input, student.uid);
    return NextResponse.json(result);
  } catch (error) {
    return testRouteErrorResponse(error, 'grade test translation');
  }
}
