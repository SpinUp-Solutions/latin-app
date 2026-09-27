import { ZodError } from 'zod';
import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import type { FeedbackErrorCode } from '@/shared/student-feedback';

export class FeedbackError extends Error {
  constructor(
    public readonly code: FeedbackErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'FeedbackError';
  }
}

const mapRouteError = createRouteErrorResponse(FeedbackError);

/** Cloud SDK errors can carry a numeric status and put URLs or credentials in their message; never pass them through. */
export function feedbackRouteErrorResponse(error: unknown, action: string) {
  if (error instanceof FeedbackError || error instanceof ZodError || error instanceof AdminAccessError) {
    return mapRouteError(error, action);
  }
  return mapRouteError(new Error('Unexpected feedback failure'), action);
}

export function invalidFeedbackDocument(message = 'Feedback data is unavailable'): never {
  throw new FeedbackError('FEEDBACK_INVALID_DOCUMENT', message, 409);
}

export function feedbackNotFound(message = 'Feedback report not found'): never {
  throw new FeedbackError('FEEDBACK_NOT_FOUND', message, 404);
}
