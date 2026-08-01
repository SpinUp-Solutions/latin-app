import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * The full-content lesson list was retired in Phase 5. Student consumers must
 * use the summary-only dashboard and authorized single-lesson detail routes so
 * the singleton Learning Path remains the only normal-sequence authority.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: 'This endpoint has been retired',
      code: 'STUDENT_LESSON_LIST_RETIRED',
    },
    { status: 410 }
  );
}
