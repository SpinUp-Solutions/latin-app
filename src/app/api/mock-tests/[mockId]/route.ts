import { NextRequest, NextResponse } from 'next/server';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { testRouteErrorResponse } from '@/src/lib/tests/api';
import { mockTestService } from '@/src/lib/tests/mock-service';
import { verifyRequestAuth } from '@/src/lib/verifyRequestAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ mockId: string }> }) {
  try {
    const student = await verifyRequestAuth(request);
    if (!student) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const mockId = firestoreDocumentIdSchema.parse((await params).mockId);
    return NextResponse.json({ detail: await mockTestService.getStudentMockDetail(mockId, student.uid) });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch mock test');
  }
}
