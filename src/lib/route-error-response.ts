import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import { DomainError } from '@/src/lib/domain-error';
import { reportServerUnexpectedError } from '@/src/lib/report-unexpected-error';

/**
 * The one mapping from a thrown error to a route response. Admin-access
 * failures, Zod validation errors and domain errors are expected and answered
 * with their own status. Anything else is logged and reported as a generic 500
 * for the supplied action, even when it has a numeric `status`: cloud SDK
 * errors do, and their messages can contain URLs or credentials. `reportTags`
 * replace or extend the tags an unexpected error is reported with.
 */
export function routeErrorResponse(error: unknown, action: string, reportTags?: Record<string, string>) {
  if (error instanceof AdminAccessError) {
    return NextResponse.json(
      { error: error.message, ...(error.code ? { code: error.code } : {}) },
      { status: error.status }
    );
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
  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
  }
  console.error(`Error ${action}:`, error);
  reportServerUnexpectedError(error, {
    tags: { surface: 'route_error_response', action, ...reportTags },
  });
  return NextResponse.json({ error: `Failed to ${action}` }, { status: 500 });
}
