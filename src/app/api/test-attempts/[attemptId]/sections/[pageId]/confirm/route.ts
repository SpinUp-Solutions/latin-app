import { confirmSectionInputSchema } from '@/shared/tests/sections';
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';
import { verifyRequestAppCheck } from '@/src/lib/verifyRequestAppCheck';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { testAttemptService } from '@/src/lib/tests/attempt-service';

export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string; pageId: string }> }
) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await verifyRequestAppCheck(request))) {
      return NextResponse.json({ error: 'Valid app attestation is required' }, { status: 401 });
    }
    const ids = await params;
    const result = await testAttemptService.confirmSection(
      firestoreDocumentIdSchema.parse(ids.attemptId),
      firestoreDocumentIdSchema.parse(ids.pageId),
      confirmSectionInputSchema.parse(await request.json().catch(() => null)),
      student.uid
    );
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    return testRouteErrorResponse(error, 'confirm test section');
  }
}
