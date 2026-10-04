import type { FeedbackErrorCode } from '@/shared/student-feedback';
import { DomainError } from '@/src/lib/domain-error';

export class FeedbackError extends DomainError {
  constructor(
    public readonly code: FeedbackErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'FeedbackError';
  }
}

export function invalidFeedbackDocument(message: string): never {
  throw new FeedbackError('FEEDBACK_INVALID_DOCUMENT', message, 409);
}

export function feedbackNotFound(): never {
  throw new FeedbackError('FEEDBACK_NOT_FOUND', 'Feedback report not found', 404);
}
