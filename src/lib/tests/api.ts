import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { LearningUnitServiceError } from '@/src/lib/learning-units/errors';
import { AdminAccessError } from '@/src/lib/verifyAdminAccess';
import { TestServiceError } from './errors';

export function testRouteErrorResponse(error: unknown, action: string) {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
      },
      { status: 400 }
    );
  }
  if (error instanceof LearningUnitServiceError || error instanceof TestServiceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  console.error(`Error ${action}:`, error);
  return NextResponse.json({ error: `Failed to ${action}` }, { status: 500 });
}
