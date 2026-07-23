import { NextRequest, NextResponse } from 'next/server';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { attemptSummaryQuerySchema } from '@/src/lib/tests/schemas';
import { testService } from '@/src/lib/tests/service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import type { TestAttemptOrigin } from '@/src/types/test';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const query = attemptSummaryQuerySchema.parse({
      originKind: searchParams.get('originKind'),
      originId: searchParams.get('originId'),
    });
    const origin: TestAttemptOrigin =
      query.originKind === 'normal-test'
        ? { kind: 'normal-test', testId: query.originId }
        : { kind: 'mock-test', mockTestId: query.originId };

    const summary = await testService.getAttemptSummary(origin, student.uid);
    return NextResponse.json({ summary });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch test attempt summary');
  }
}
