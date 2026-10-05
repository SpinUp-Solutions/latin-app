import { DomainError } from '@/src/lib/domain-error';

export type LearningPathServiceErrorCode =
  | 'LEARNING_PATH_NOT_FOUND'
  | 'STALE_LEARNING_PATH_DATA'
  | 'STALE_LEARNING_PATH_REVISION'
  | 'UNKNOWN_LEARNING_UNIT'
  | 'INELIGIBLE_LEARNING_UNIT'
  | 'LEARNING_PATH_TOO_LARGE'
  | 'PLACED_UNIT_DELETE'
  | 'PLACED_UNIT_INVALID'
  | 'LEGACY_NORMAL_PLACEMENT_RETIRED';

export class LearningPathServiceError extends DomainError {
  constructor(
    public readonly code: LearningPathServiceErrorCode,
    message: string,
    public readonly status: 400 | 404 | 409 | 422
  ) {
    super(message);
    this.name = 'LearningPathServiceError';
  }
}
