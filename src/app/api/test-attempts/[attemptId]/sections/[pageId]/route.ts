import { sectionPhaseInputSchema } from '@/shared/tests/sections';
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testAttemptService } from '@/src/lib/tests/attempt-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string; pageId: string }> }
) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const ids = await params;
    const attempt = await testAttemptService.setSectionPhase(
      firestoreDocumentIdSchema.parse(ids.attemptId),
      firestoreDocumentIdSchema.parse(ids.pageId),
      sectionPhaseInputSchema.parse(await request.json().catch(() => null)),
      student.uid
    );
    return NextResponse.json({ attempt });
  } catch (error) {
    return testRouteErrorResponse(error, 'change test section phase');
  }
}
