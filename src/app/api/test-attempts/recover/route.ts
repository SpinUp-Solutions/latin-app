import { NextRequest, NextResponse } from 'next/server';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { startTestAttemptInputSchema } from '@/src/lib/tests/schemas';
import { testService } from '@/src/lib/tests/service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

export async function POST(request: NextRequest) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const input = startTestAttemptInputSchema.parse(await request.json().catch(() => null));
    const result = await testService.recoverAttemptSession(input, student.uid);
    return NextResponse.json(result);
  } catch (error) {
    return testRouteErrorResponse(error, 'recover test attempt session');
  }
}
