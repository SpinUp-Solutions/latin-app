import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AdminAccessError } from '@/src/lib/admin-access-error';

interface RouteDomainError extends Error {
  readonly code: string;
  readonly status: number;
}

/**
 * Builds a route error mapper that recognizes admin-access failures, Zod
 * validation errors, and the given domain error classes. Anything else is
 * logged and reported as a generic 500 for the supplied action.
 */
export function createRouteErrorResponse(...domainErrorClasses: Array<new (...args: never[]) => RouteDomainError>) {
  return function routeErrorResponse(error: unknown, action: string) {
    if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
      return NextResponse.json({ error: error.message, ...(code ? { code } : {}) }, { status: error.status });
    }
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
    for (const DomainError of domainErrorClasses) {
      if (error instanceof DomainError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
    }
    console.error(`Error ${action}:`, error);
    return NextResponse.json({ error: `Failed to ${action}` }, { status: 500 });
  };
}
