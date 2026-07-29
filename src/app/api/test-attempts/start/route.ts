import { NextRequest, NextResponse } from 'next/server';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { startTestAttemptInputSchema } from '@/src/lib/tests/schemas';
import { testAttemptService } from '@/src/lib/tests/attempt-service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

export async function POST(request: NextRequest) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const input = startTestAttemptInputSchema.parse(await request.json().catch(() => null));
    const result = await testAttemptService.startAttempt(input, student.uid);
    return NextResponse.json(result, { status: result.resumed ? 200 : 201 });
  } catch (error) {
    return testRouteErrorResponse(error, 'start test attempt');
  }
}
