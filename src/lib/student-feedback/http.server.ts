import { createRouteErrorResponse } from '@/src/lib/route-error-response';
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

export const feedbackRouteErrorResponse = createRouteErrorResponse(FeedbackError);

export function invalidFeedbackDocument(message: string): never {
  throw new FeedbackError('FEEDBACK_INVALID_DOCUMENT', message, 409);
}

export function feedbackNotFound(): never {
  throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Feedback report not found', 404);
}
